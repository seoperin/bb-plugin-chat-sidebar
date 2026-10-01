// The sidebar thread list, as a messenger: search, folders, and chats.
//
// bb keeps the New-thread button, plugin rows, and footer; this component
// owns the scrolling list only. Opening a chat routes through bb's own
// `actions.open`, so splits, pane focus, and the mobile drawer behave as in
// bb's list.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  experimental_useProviders,
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreads,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

import { usePaging } from "@/hooks/use-paging";
import { usePinnedOrder } from "@/hooks/use-pinned-order";
import { useScrollArea } from "@/hooks/use-scroll-area";
import {
  buildChats,
  buildFolders,
  groupByProject,
  inFolder,
  isQuiet,
  matchesQuery,
  projectsByUse,
  type Chat,
  type FolderId,
} from "@/lib/model";
import { parseStringArray, readStored, writeStored } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { BackToTop } from "./back-to-top";
import { ChatProvider, useChat } from "./chat-context";
import { ChatRow, type ProviderSummary, type RowDrag } from "./chat-row";
import { FolderRail } from "./folder-rail";
import { FolderTabs } from "./folder-tabs";
import { GroupHeader } from "./group-header";
import { NewChatButton } from "./new-chat-button";
import { ProjectColorsProvider } from "./project-colors";
import { SearchBar } from "./search-bar";

const PAGE_SIZE = 60;
const DAY = 86_400_000;
const FOLDER_KEY = "chat-sidebar/folder";
const COLLAPSED_KEY = "chat-sidebar/collapsed-groups";
const ACTIVE_ONLY = { experimental_lifecycles: ["active"] } as const;
const WITH_ARCHIVE = { experimental_lifecycles: ["active", "archived"] } as const;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The height of an element, kept current. */
function useHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

/** Arrow keys move between rows; from the search field, ArrowDown enters the list. */
function focusRow(container: HTMLElement | null, from: Element | null, step: 1 | -1 | "first") {
  const anchors = [...(container?.querySelectorAll<HTMLElement>("[data-chat-anchor]") ?? [])];
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

function ChatListView({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const { settings, i18n } = useChat();
  const { t } = i18n;
  const [folder, setFolderState] = useState<FolderId>(() =>
    readStored<FolderId>(FOLDER_KEY, (raw) => raw as FolderId, "all"),
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
  const actions = experimental_useSidebarThreadActions();
  const { providers } = experimental_useProviders();
  const now = useNow(30_000);
  const [query, setQuery] = useState("");
  const [showQuiet, setShowQuiet] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(readStored(COLLAPSED_KEY, parseStringArray, [])),
  );
  const rail = settings.folderLayout === "rail";
  const listRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  // Sticky project headings sit right under the search bar and tabs.
  const topHeight = useHeight(topRef);
  const scrollArea = useScrollArea(topRef, { trackHeight: rail });

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

  const chats = useMemo(
    () => buildChats(threads, projects, { foldChildren: settings.foldChildren }),
    [threads, projects, settings.foldChildren],
  );
  const archivedChats = useMemo(
    () =>
      archiveMode ? buildChats(threads, projects, { lifecycle: "archived", foldChildren: settings.foldChildren }) : [],
    [archiveMode, threads, projects, settings.foldChildren],
  );
  // Automatic colours go to projects that have chats, so a few busy projects
  // are not pushed into the in-between hues by empty ones.
  const projectsInUse = useMemo(() => projectsByUse(chats, projects), [chats, projects]);
  const folders = useMemo(
    () =>
      buildFolders(chats, projects, sections, {
        projectTabs: settings.projects === "tabs",
        sectionTabs: settings.sectionFolders,
        archiveTab: settings.archiveFolder,
      }),
    [chats, projects, sections, settings.projects, settings.sectionFolders, settings.archiveFolder],
  );
  // A remembered folder that no longer exists falls back to All.
  const currentFolder = folders.find((item) => item.id === folder) ?? folders[0] ?? null;
  const activeFolder: FolderId = currentFolder?.id ?? "all";

  const { ordered, reorder } = usePinnedOrder(chats, listRef, t("toast.reorderFailed"));

  const needle = query.trim().toLocaleLowerCase();
  const matched = (archiveMode ? archivedChats : ordered).filter(
    (chat) => (archiveMode || inFolder(chat, activeFolder)) && matchesQuery(chat, needle),
  );
  // Quiet old chats hide behind one button; search and Attention see all.
  const cutoff = settings.hideQuietAfterDays > 0 ? now - settings.hideQuietAfterDays * DAY : null;
  const hidesQuiet = cutoff !== null && !showQuiet && needle === "" && !archiveMode && activeFolder !== "attention";
  const shown = hidesQuiet ? matched.filter((chat) => !isQuiet(chat, cutoff)) : matched;
  const hiddenQuiet = matched.length - shown.length;

  const paging = usePaging(shown.length, PAGE_SIZE, `${activeFolder}\n${needle}`);
  const visible = shown.slice(0, paging.limit);

  const providerById = useMemo(
    () => new Map<string, ProviderSummary>(providers.map((provider) => [provider.id, provider])),
    [providers],
  );
  const grouped = settings.projects === "headers" && !archiveMode && needle === "";
  const showProject = !activeFolder.startsWith("project:") && !grouped;
  const showHost = (hosts?.length ?? 0) > 1;
  const pinDragAllowed = !archiveMode && needle === "";

  const renderRow = (chat: Chat) => {
    const { id } = chat.thread;
    const drag: RowDrag | null =
      pinDragAllowed && chat.thread.isPinned
        ? {
            dragging: reorder.state.dragging === id,
            hint: reorder.state.hint?.id === id ? reorder.state.hint.place : null,
            onPointerDown: (event) => reorder.start(id, event),
          }
        : null;
    const active =
      activeThreadId !== null && (id === activeThreadId || chat.children.some((child) => child.id === activeThreadId));
    return (
      <ChatRow
        key={id}
        row={chat}
        active={active}
        now={now}
        provider={providerById.get(chat.thread.providerId) ?? null}
        showProject={showProject}
        showHost={showHost}
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
  const note = (text: string) => <p className="px-3 py-6 text-center text-xs text-muted-foreground">{text}</p>;
  const newChat = <NewChatButton folder={currentFolder} projects={projectsInUse} onNavigate={onNavigate} />;

  return (
    <ProjectColorsProvider projects={projectsInUse}>
      <div
        className={cn(
          // bb's scroll area is a flex column: without shrink-0 the list is
          // squeezed to one screen and the sticky search scrolls away with it.
          "chat-sidebar flex min-h-full shrink-0",
          reorder.state.dragging !== null && "cursor-grabbing select-none",
        )}
        style={{ "--chat-top": `${topHeight}px` } as CSSProperties}
      >
        {rail ? (
          <FolderRail
            folders={folders}
            rows={chats}
            active={activeFolder}
            height={scrollArea.viewportHeight}
            onSelect={setFolder}
            top={newChat}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={paging.topRef} className="-mb-px h-px" aria-hidden="true" />
          <div ref={topRef} className="sticky top-0 z-10 bg-sidebar pt-1">
            <div className="flex items-center gap-1.5 px-2 pb-2">
              <SearchBar
                query={query}
                onChange={setQuery}
                onSubmit={() => {
                  if (shown[0] !== undefined) open(shown[0].thread.id, false);
                }}
                onArrowDown={() => focusRow(listRef.current, null, "first")}
              />
              {rail ? null : newChat}
            </div>
            {rail ? null : <FolderTabs folders={folders} rows={chats} active={activeFolder} onSelect={setFolder} />}
          </div>

          <div
            ref={listRef}
            role="region"
            aria-label={t("list.label")}
            onKeyDown={onListKeyDown}
            className="px-1.5 pb-2"
          >
            {status === "loading" ? (
              note(t("list.loading"))
            ) : status === "error" && chats.length === 0 ? (
              note(t("list.error"))
            ) : shown.length === 0 ? (
              note(emptyText)
            ) : grouped ? (
              groupByProject(visible, projects).map((group) => (
                <section key={group.key} className="mb-1">
                  <GroupHeader
                    group={group}
                    collapsed={collapsed.has(group.key)}
                    sticky={settings.stickyHeadings}
                    onToggle={() => toggleGroup(group.key)}
                  />
                  {collapsed.has(group.key) ? null : <ul className="space-y-px">{group.chats.map(renderRow)}</ul>}
                </section>
              ))
            ) : (
              <ul className="space-y-px">{visible.map(renderRow)}</ul>
            )}
            {paging.hasMore ? <div ref={paging.endRef} className="h-8" aria-hidden="true" /> : null}
            {hiddenQuiet > 0 ? (
              <button
                type="button"
                onClick={() => setShowQuiet(true)}
                className="mx-auto mt-1 block cursor-pointer rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              >
                {t("list.hiddenQuiet", { count: hiddenQuiet })}
              </button>
            ) : null}
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

          <BackToTop
            visible={scrollArea.farFromTop && reorder.state.dragging === null}
            onClick={scrollArea.scrollToTop}
          />
        </div>
      </div>
    </ProjectColorsProvider>
  );
}
