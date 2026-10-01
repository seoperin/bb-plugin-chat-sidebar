// The sidebar thread list, as a messenger: search, folder tabs, and chats.
//
// bb keeps the New-thread button, plugin rows, and footer; this component
// owns the scrolling list only. Opening a chat routes through bb's own
// `actions.open`, so splits, pane focus, and the mobile drawer behave as in
// bb's list.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import {
  experimental_useProviders,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreads,
  useSdk,
  type PluginSidebarProject,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  buildChats,
  buildFolders,
  groupByProject,
  inFolder,
  isQuiet,
  matchesQuery,
  pinNeighbors,
  type ChatRow as ChatRowModel,
  type FolderId,
  type ProjectGroup,
} from "@/lib/model";
import { cn } from "@/lib/utils";
import { ChatProvider, useChat } from "./chat-context";
import { ChatRow, type ProviderSummary, type RowDrag } from "./chat-row";
import { FolderTabs } from "./folder-tabs";
import { usePinReorder } from "./use-pin-reorder";

const PAGE_SIZE = 60;
const DAY = 86_400_000;
const FOLDER_KEY = "chat-sidebar/folder";
const COLLAPSED_KEY = "chat-sidebar/collapsed-groups";
const ACTIVE_ONLY = { experimental_lifecycles: ["active"] } as const;
const WITH_ARCHIVE = { experimental_lifecycles: ["active", "archived"] } as const;

// Per-viewer conveniences: without storage they simply are not remembered.
function readStored<T>(key: string, parse: (raw: string) => T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : parse(raw);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Arrow keys move between rows; from the search field, ArrowDown enters the list. */
function focusRow(container: HTMLElement | null, from: Element | null, step: 1 | -1 | "first") {
  const anchors = [...(container?.querySelectorAll<HTMLElement>("[data-chat-anchor]") ?? [])];
  if (anchors.length === 0) return;
  if (step === "first") {
    anchors[0]?.focus();
    return;
  }
  const index = anchors.findIndex((anchor) => anchor === from);
  anchors[Math.min(anchors.length - 1, Math.max(0, index + step))]?.focus();
}

export function ChatList(props: PluginThreadListProps) {
  return (
    <ChatProvider>
      <ChatListView {...props} />
    </ChatProvider>
  );
}

function GroupHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: ProjectGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useChat().i18n;
  const name =
    group.key === "pinned"
      ? t("folder.pinned")
      : group.project === null
        ? t("folder.other")
        : group.project.isPersonal
          ? t("folder.personal")
          : group.project.name;
  const unread = group.rows.filter((row) => row.unread).length;
  const lane = group.rows.some((row) => row.lane === "attention")
    ? "attention"
    : group.rows.some((row) => row.lane === "working")
      ? "working"
      : null;
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={t(collapsed ? "folder.expand" : "folder.collapse", { name })}
      onClick={onToggle}
      className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} className="size-3 shrink-0" />
      <span className="min-w-0 truncate">{name}</span>
      {collapsed && lane !== null ? (
        <span data-lane={lane} className="chat-lane-dot size-1.5 shrink-0 rounded-full" aria-hidden="true" />
      ) : null}
      {collapsed && unread > 0 ? (
        <span className="ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-muted-foreground/20 px-1 text-[10px] font-semibold tabular-nums normal-case">
          {unread}
        </span>
      ) : null}
    </button>
  );
}

function ChatListView({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const { settings, i18n } = useChat();
  const { t } = i18n;
  const [folder, setFolderState] = useState<FolderId>(() =>
    readStored(FOLDER_KEY, (raw) => raw as FolderId, "all"),
  );
  // bb sends the archive in pages and only on request: load it while open.
  const archiveMode = folder === "archive" && settings.archiveFolder;
  const {
    status,
    threads,
    projects,
    sections,
    experimental_hosts: hosts,
    experimental_archived: archivePages,
  } = experimental_useSidebarThreads(archiveMode ? WITH_ARCHIVE : ACTIVE_ONLY);
  const sdk = useSdk();
  const actions = experimental_useSidebarThreadActions();
  const { providers } = experimental_useProviders();
  const now = useNow(30_000);
  const [query, setQuery] = useState("");
  const [showQuiet, setShowQuiet] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(readStored<string[]>(COLLAPSED_KEY, (raw) => JSON.parse(raw) as string[], [])),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const setFolder = (next: FolderId) => {
    setFolderState(next);
    writeStored(FOLDER_KEY, next);
  };
  const toggleGroup = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeStored(COLLAPSED_KEY, JSON.stringify([...next]));
      return next;
    });
  const open = (threadId: string, split: boolean) => {
    actions.open(threadId, { split });
    onNavigate();
  };

  const rows = useMemo(
    () => buildChats(threads, projects, { foldChildren: settings.foldChildren }),
    [threads, projects, settings.foldChildren],
  );
  const archivedRows = useMemo(
    () =>
      archiveMode
        ? buildChats(threads, projects, { lifecycle: "archived", foldChildren: settings.foldChildren })
        : [],
    [archiveMode, threads, projects, settings.foldChildren],
  );
  const folders = useMemo(
    () =>
      buildFolders(rows, projects, sections, {
        projectTabs: settings.projects === "tabs",
        sectionTabs: settings.sectionFolders,
        archiveTab: settings.archiveFolder,
      }),
    [rows, projects, sections, settings.projects, settings.sectionFolders, settings.archiveFolder],
  );
  const activeFolder: FolderId = folders.some((item) => item.id === folder) ? folder : "all";

  // Pinned order is global across folders. Until bb sends the new order back,
  // show the one we asked for.
  const pinnedOrder = useMemo(
    () => rows.filter((row) => row.thread.isPinned).map((row) => row.thread.id),
    [rows],
  );
  const [optimisticPins, setOptimisticPins] = useState<string[] | null>(null);
  const pinnedKey = pinnedOrder.join(",");
  useEffect(() => setOptimisticPins(null), [pinnedKey]);
  const orderedRows = useMemo(() => {
    if (optimisticPins === null) return rows;
    const rank = new Map(optimisticPins.map((id, index) => [id, index]));
    const pinned = rows
      .filter((row) => row.thread.isPinned)
      .sort((a, b) => (rank.get(a.thread.id) ?? 0) - (rank.get(b.thread.id) ?? 0));
    return [...pinned, ...rows.filter((row) => !row.thread.isPinned)];
  }, [rows, optimisticPins]);
  const reorder = usePinReorder(listRef, (dragged, target, place) => {
    const plan = pinNeighbors(optimisticPins ?? pinnedOrder, dragged, target, place);
    if (plan === null) return;
    setOptimisticPins(plan.order);
    sdk.threads
      .reorderPinned({ threadId: dragged, previousThreadId: plan.previousThreadId, nextThreadId: plan.nextThreadId })
      .catch((cause: unknown) => {
        setOptimisticPins(null);
        toast.error(t("toast.reorderFailed"), {
          description: cause instanceof Error ? cause.message : String(cause),
        });
      });
  });

  const needle = query.trim().toLocaleLowerCase();
  const matched = (archiveMode ? archivedRows : orderedRows).filter(
    (row) => (archiveMode || inFolder(row, activeFolder)) && matchesQuery(row, needle),
  );
  // Quiet old chats hide behind one button; search and Attention see all.
  const cutoff = settings.hideQuietAfterDays > 0 ? now - settings.hideQuietAfterDays * DAY : null;
  const hidesQuiet =
    cutoff !== null && !showQuiet && needle === "" && !archiveMode && activeFolder !== "attention";
  const shown = hidesQuiet ? matched.filter((row) => !isQuiet(row, cutoff)) : matched;
  const hiddenQuiet = matched.length - shown.length;

  useEffect(() => setLimit(PAGE_SIZE), [activeFolder, needle]);
  const visible = shown.slice(0, limit);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || visible.length >= shown.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => value + PAGE_SIZE);
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible.length, shown.length]);

  const providerById = useMemo(
    () => new Map<string, ProviderSummary>(providers.map((provider) => [provider.id, provider])),
    [providers],
  );
  const inProjectFolder = activeFolder.startsWith("project:");
  const grouped = settings.projects === "headers" && !archiveMode && needle === "";
  const pinDragAllowed = !archiveMode && needle === "";

  const renderRow = (row: ChatRowModel) => {
    const drag: RowDrag | null =
      pinDragAllowed && row.thread.isPinned
        ? {
            dragging: reorder.state.dragging === row.thread.id,
            hint: reorder.state.hint?.id === row.thread.id ? reorder.state.hint.place : null,
            onPointerDown: (event) => reorder.start(row.thread.id, event),
          }
        : null;
    return (
      <ChatRow
        key={row.thread.id}
        row={row}
        active={
          activeThreadId !== null &&
          (row.thread.id === activeThreadId || row.children.some((child) => child.id === activeThreadId))
        }
        now={now}
        provider={providerById.get(row.thread.providerId) ?? null}
        showProject={!inProjectFolder && !grouped}
        showHost={(hosts?.length ?? 0) > 1}
        drag={drag}
        onOpen={open}
      />
    );
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches("[data-chat-anchor]")) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(listRef.current, event.target, event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const emptyText =
    needle !== ""
      ? t("search.nothing", { query: query.trim() })
      : archiveMode
        ? archivePages?.status === "loading"
          ? t("list.archiveLoading")
          : t("list.archiveEmpty")
        : activeFolder === "attention"
          ? t("list.emptyAttention")
          : t("list.empty");

  const quietButton =
    hiddenQuiet > 0 ? (
      <button
        type="button"
        onClick={() => setShowQuiet(true)}
        className="mx-auto mt-1 block cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
      >
        {t("list.hiddenQuiet", { count: hiddenQuiet })}
      </button>
    ) : null;

  return (
    <div
      className={cn(
        "chat-sidebar flex min-h-full flex-col",
        reorder.state.dragging !== null && "cursor-grabbing select-none",
      )}
    >
      <div className="sticky top-0 z-10 bg-sidebar pt-1">
        <div className="relative px-2 pb-2">
          <Icon
            name="Search"
            className="pointer-events-none absolute left-4 top-[7px] size-3.5 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (query !== "") event.stopPropagation();
                setQuery("");
              }
              if (event.key === "Enter" && shown[0] !== undefined) open(shown[0].thread.id, false);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusRow(listRef.current, null, "first");
              }
            }}
            placeholder={t("search.placeholder")}
            aria-label={t("search.label")}
            className="h-7 rounded-full border-transparent bg-sidebar-accent/70 pl-7 pr-7 text-xs shadow-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query !== "" ? (
            <button
              type="button"
              aria-label={t("search.clear")}
              onClick={() => setQuery("")}
              className="absolute right-3.5 top-[5px] grid size-[18px] cursor-pointer place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <Icon name="X" className="size-3" />
            </button>
          ) : null}
        </div>
        <FolderTabs folders={folders} rows={rows} active={activeFolder} onSelect={setFolder} />
      </div>

      <div ref={listRef} aria-label={t("list.label")} role="region" onKeyDown={onListKeyDown} className="px-1.5 pb-2">
        {status === "loading" ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("list.loading")}</p>
        ) : status === "error" && rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("list.error")}</p>
        ) : shown.length === 0 ? (
          <>
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
            {quietButton}
          </>
        ) : grouped ? (
          groupByProject(visible, projects as readonly PluginSidebarProject[]).map((group) => (
            <section key={group.key} className="mb-1">
              <GroupHeader
                group={group}
                collapsed={collapsed.has(group.key)}
                onToggle={() => toggleGroup(group.key)}
              />
              {collapsed.has(group.key) ? null : <ul className="space-y-px">{group.rows.map(renderRow)}</ul>}
            </section>
          ))
        ) : (
          <ul className="space-y-px">{visible.map(renderRow)}</ul>
        )}
        {visible.length < shown.length ? <div ref={sentinelRef} className="h-8" aria-hidden="true" /> : null}
        {shown.length > 0 ? quietButton : null}
        {archiveMode && archivePages?.hasNextPage ? (
          <button
            type="button"
            disabled={archivePages.isFetchingNextPage}
            onClick={() => void archivePages.fetchNextPage()}
            className="mx-auto mt-1 block cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground disabled:opacity-50"
          >
            {archivePages.isFetchingNextPage ? t("list.loadingMore") : t("list.loadMore")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
