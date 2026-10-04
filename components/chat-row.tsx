// One chat in the list. The row is an anchor on the thread's href, with the
// two data attributes bb's thread shortcuts (⌘1…9, next/previous) look for,
// and with bb's split-drag handler, so it behaves like bb's own row. A pinned
// row is also sortable: its <li> takes the drag, its anchor the split.
import { useState, type MouseEvent } from "react";
import {
  ThreadTitle,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  experimental_useSidebarThreadSplit,
  useSidebarThreadDraft,
  useSidebarThreadRowStatus,
  useSidebarThreadShortcut,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { useSortableItem, type SortableBindings } from "@/hooks/use-sortable";
import { avatarBackground } from "@/lib/colors";
import { avatarLetter, type Chat } from "@/lib/model";
import { statusMessage } from "@/lib/status";
import { formatChatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-context";
import { ChatMenu } from "./chat-menu";
import { useProjectColors } from "./project-colors";
import { RenameInput } from "./rename-input";

export type ProviderSummary = ReturnType<typeof experimental_useProviders>["providers"][number];

function Avatar({ row, size }: { row: Chat; size: "md" | "sm" }) {
  const color = useProjectColors().colorOf(row.project?.id ?? null, row.thread.id);
  const busy = row.lane === "working" || row.lane === "attention";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full font-semibold text-white",
        size === "md" ? "size-9 text-sm" : "size-5 text-[10px]",
      )}
      style={{ background: avatarBackground(color) }}
    >
      {avatarLetter(row)}
      {busy ? (
        <span
          data-lane={row.lane ?? undefined}
          className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-sidebar"
        >
          <span className="chat-lane-dot chat-pulse size-2 rounded-full" />
        </span>
      ) : null}
    </span>
  );
}

/** Status first, then another plugin's row status, then the draft marker. */
function StatusBadge({ row, active }: { row: Chat; active: boolean }) {
  const { t } = useChat().i18n;
  const { thread, lane } = row;
  const rowStatus = useSidebarThreadRowStatus(thread.id);
  const { hasUnsubmittedDraft } = useSidebarThreadDraft(thread.id);
  if (lane === "working" || lane === "attention") {
    const [key, params] = statusMessage(thread, lane);
    const detail = t(key, params);
    const label = t(lane === "working" ? "status.working" : "status.waiting");
    return (
      <span
        data-lane={lane}
        title={row.busyChildren > 0 ? `${detail} · ${t("row.subAgents", { count: row.busyChildren })}` : detail}
        className="chat-lane-text flex min-w-0 shrink items-center gap-1 font-medium"
      >
        {lane === "working" ? (
          <span className="chat-spinner size-2.5 shrink-0 rounded-full" aria-hidden="true" />
        ) : (
          <span className="chat-lane-dot size-1.5 shrink-0 rounded-full" aria-hidden="true" />
        )}
        <span className="truncate">{lane === "working" ? detail : label}</span>
        {row.busyChildren > 0 ? <span className="shrink-0 tabular-nums">+{row.busyChildren}</span> : null}
      </span>
    );
  }
  if (rowStatus !== null) {
    return (
      <span
        data-tone={rowStatus.tone ?? "default"}
        className="chat-tone-text flex min-w-0 shrink items-center gap-1 font-medium"
      >
        <Icon name={rowStatus.icon} className="size-3 shrink-0" />
        <span className="truncate">{rowStatus.label}</span>
      </span>
    );
  }
  if (hasUnsubmittedDraft && !active) {
    return (
      <span className="flex shrink-0 items-center gap-1 font-medium text-destructive">
        <Icon name="Edit" className="size-3" />
        {t("row.draft")}
      </span>
    );
  }
  if (lane === "done") {
    return (
      <span data-lane="done" className="chat-lane-text shrink-0 font-medium">
        {t("status.done")}
      </span>
    );
  }
  return null;
}

/** Where the work happens: provider, then project (unless the folder says it), then branch or machine. */
function WhereLine({
  row,
  provider,
  showProject,
  showHost,
}: {
  row: Chat;
  provider: ProviderSummary | null;
  showProject: boolean;
  showHost: boolean;
}) {
  const { t } = useChat().i18n;
  const { thread } = row;
  const branch = thread.environment?.branchName ?? null;
  const project =
    showProject && row.project !== null ? (row.project.isPersonal ? t("folder.personal") : row.project.name) : null;
  // The machine only tells something when there is more than one.
  const host = showHost ? (thread.host?.name ?? null) : null;
  const parts = [project, branch, host].filter((part): part is string => part !== null && part !== "");
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
      <ProviderIcon providerKind="agent" provider={provider ?? { id: thread.providerId }} className="size-3 shrink-0" />
      {parts.length > 0 ? <span className="min-w-0 truncate">{parts.join(" · ")}</span> : null}
    </span>
  );
}

function TimeOrShortcut({ row, now }: { row: Chat; now: number }) {
  const { i18n } = useChat();
  const shortcut = useSidebarThreadShortcut(row.thread.id);
  if (shortcut !== null) {
    return (
      <kbd className="shrink-0 rounded border border-sidebar-border px-1 font-sans text-[10px] leading-4 text-muted-foreground">
        {shortcut.label}
      </kbd>
    );
  }
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
      {formatChatTime(row.activityAt, now, i18n)}
    </span>
  );
}

function UnreadDot() {
  const { t } = useChat().i18n;
  return <span role="img" aria-label={t("row.unread")} className="chat-unread size-2 shrink-0 rounded-full" />;
}

export function ChatRow({
  row,
  active,
  now,
  provider,
  showProject,
  showHost,
  sortable,
  onOpen,
}: {
  row: Chat;
  active: boolean;
  now: number;
  provider: ProviderSummary | null;
  /** False inside a project's own folder, where the name would repeat. */
  showProject: boolean;
  /** True when several machines run threads, so the machine name tells something. */
  showHost: boolean;
  /** Pinned rows only: dragging reorders the pins (see `hooks/use-sortable.ts`). */
  sortable: SortableBindings | null;
  onOpen: (threadId: string, split: boolean) => void;
}) {
  const { settings, i18n } = useChat();
  const { t } = i18n;
  const { thread } = row;
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const [renaming, setRenaming] = useState(false);
  const compact = settings.density === "compact";

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Shift and Alt keep the browser's own link behaviour.
    if (event.button !== 0 || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(thread.id, event.metaKey || event.ctrlKey);
  };

  const title = (
    <span className={cn("min-w-0 flex-1 truncate", row.unread ? "font-semibold text-foreground" : "font-medium")}>
      <ThreadTitle threadId={thread.id} />
    </span>
  );

  return (
    <li
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      {...sortable?.handleProps}
      data-chat-row={thread.id}
      className={cn("relative list-none", sortable?.isDragging && "rounded-lg bg-sidebar shadow-lg")}
    >
      {renaming ? (
        <div className={cn("flex items-center gap-2 rounded-lg bg-sidebar-accent px-2", compact ? "h-8" : "h-14")}>
          <Avatar row={row} size={compact ? "sm" : "md"} />
          <RenameInput thread={thread} onDone={() => setRenaming(false)} />
        </div>
      ) : (
        <ChatMenu row={row} onOpen={onOpen} onRename={() => setRenaming(true)}>
          <a
            href={thread.href}
            data-sidebar-thread-shortcut-target=""
            data-sidebar-thread-id={thread.id}
            data-chat-anchor=""
            aria-current={active ? "page" : undefined}
            aria-keyshortcuts={shortcut?.ariaKeyshortcuts}
            draggable={false}
            onClick={onClick}
            onPointerDown={splitProps.onPointerDown}
            onDoubleClick={(event) => {
              event.preventDefault();
              setRenaming(true);
            }}
            className={cn(
              "group flex select-none items-center rounded-lg text-sidebar-foreground no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              compact ? "h-8 gap-2 px-2 text-[13px]" : "gap-3 px-2 py-2 text-[13.5px]",
              active ? "bg-sidebar-accent text-foreground" : "hover:bg-sidebar-accent/60",
            )}
          >
            <Avatar row={row} size={compact ? "sm" : "md"} />
            {compact ? (
              <>
                {title}
                <span className="flex max-w-[45%] shrink-0 items-center gap-1.5 text-[11px]">
                  <StatusBadge row={row} active={active} />
                  {thread.isPinned ? (
                    <Icon name="Pin" aria-label={t("row.pinned")} className="size-3 shrink-0 text-muted-foreground" />
                  ) : null}
                  {row.unread ? <UnreadDot /> : null}
                  <TimeOrShortcut row={row} now={now} />
                </span>
              </>
            ) : (
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {title}
                  {thread.isPinned ? (
                    <Icon name="Pin" aria-label={t("row.pinned")} className="size-3 shrink-0 text-muted-foreground" />
                  ) : null}
                  <TimeOrShortcut row={row} now={now} />
                </span>
                <span className="mt-1 flex h-4 items-center gap-1.5 text-[11.5px]">
                  <StatusBadge row={row} active={active} />
                  <WhereLine row={row} provider={provider} showProject={showProject} showHost={showHost} />
                  {row.unread ? <UnreadDot /> : null}
                </span>
              </span>
            )}
          </a>
        </ChatMenu>
      )}
    </li>
  );
}

/** A pinned row: the same row, sortable among the pins. */
export function SortableChatRow(props: Omit<Parameters<typeof ChatRow>[0], "sortable">) {
  const sortable = useSortableItem(props.row.thread.id);
  return <ChatRow {...props} sortable={sortable} />;
}
