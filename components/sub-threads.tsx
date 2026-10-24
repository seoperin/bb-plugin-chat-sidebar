// Folded sub-agents, opened under their chat (the "Expandable sub-agents"
// setting). The chat's row gets an arrow with the count; open, the children
// follow as small rows, each nested under the thread that started it, so a
// lead and its workers read as one tree.
//
// Child rows are anchors on the thread's href, reached with the arrow keys
// like any row, but without bb's ⌘1…9 target: those numbers belong to the
// chats, and children appearing would renumber them. Each has bb's own thread
// menu (archive, delete, rename, …) plus "Make a separate chat", and the row's
// quick actions on hover.
import { useMemo, useState, type MouseEvent, type PointerEvent } from "react";
import { toast } from "sonner";
import {
  ThreadTitle,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_THREAD_ACTION_GROUPS as GROUPS,
  experimental_useSidebarThreadSplit,
  useSdk,
  type PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { childTree, type Chat, type ChildNode } from "@/lib/model";
import { laneOf, statusMessage } from "@/lib/status";
import { formatChatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useChat } from "./chat-context";
import { RenameInput } from "./rename-input";
import { RowQuickActions } from "./row-actions";
import { toActionTarget } from "./thread-actions";

/** Deeper levels stop indenting: the sidebar is narrow. */
const MAX_INDENT = 4;

/** The arrow and count on a chat with sub-agents. Lives inside the row's anchor. */
export function SubThreadToggle({
  row,
  expanded,
  onToggle,
}: {
  row: Chat;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useChat().i18n;
  const count = row.children.length;
  const label = expanded ? t("row.hideSubAgents") : t("row.showSubAgents", { count });
  // A button inside the row's anchor: keep the click from opening the chat
  // and the press from starting bb's split drag.
  const stop = (event: MouseEvent | PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      onPointerDown={stop}
      onDoubleClick={stop}
      onClick={(event) => {
        stop(event);
        onToggle();
      }}
      className={cn(
        "flex h-4 shrink-0 cursor-pointer items-center gap-0.5 rounded px-1 text-[10.5px] tabular-nums text-muted-foreground hover:bg-background/60 hover:text-foreground",
        expanded && "bg-background/50 text-foreground",
      )}
    >
      <Icon name={expanded ? "ChevronDown" : "ChevronRight"} className="size-3" />
      {count}
    </span>
  );
}

function ChildStatus({ node }: { node: ChildNode }) {
  const { t } = useChat().i18n;
  const lane = laneOf(node.thread);
  if (lane === null) return <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />;
  const [key, params] = statusMessage(node.thread, lane);
  const detail = t(key, params);
  return lane === "working" ? (
    <span data-lane={lane} title={detail} className="chat-spinner size-2 shrink-0 rounded-full" />
  ) : (
    <span data-lane={lane} title={detail} className="chat-lane-dot size-1.5 shrink-0 rounded-full" />
  );
}

function ChildRow({
  node,
  active,
  now,
  onOpen,
}: {
  node: ChildNode;
  active: boolean;
  now: number;
  onOpen: (threadId: string, split: boolean) => void;
}) {
  const { i18n } = useChat();
  const { t } = i18n;
  const sdk = useSdk();
  const { thread } = node;
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const target = useMemo(() => toActionTarget(thread), [thread]);
  // Detaching clears the parent link: the thread leaves the tree, takes its
  // own children along, and stops reporting to its former parent. A thread
  // held only by a lifecycle owner (no parent) has nothing to detach.
  const inline: PluginThreadActionsInlineItem[] =
    thread.parentThreadId === null
      ? []
      : [
          {
            key: "detach",
            group: GROUPS.organize,
            action: {
              label: t("menu.detach"),
              icon: "Unlink",
              run: async () => {
                try {
                  await sdk.threads.update({ threadId: thread.id, parentThreadId: null });
                } catch {
                  toast.error(t("toast.detachFailed"));
                }
              },
            },
          },
        ];
  const [renaming, setRenaming] = useState(false);
  const attention = laneOf(thread) === "attention";
  const indent = { paddingLeft: `${(Math.min(node.depth, MAX_INDENT) - 1) * 12 + 6}px` };
  if (renaming) {
    return (
      <div style={indent} className="flex h-6 items-center rounded-md bg-sidebar-accent pr-1">
        <RenameInput thread={thread} onDone={() => setRenaming(false)} className="h-5 text-[12px]" />
      </div>
    );
  }
  return (
    <div className="group/row relative">
      <ThreadActionsContextMenu thread={target} inline={inline} requestRename={() => setRenaming(true)}>
        <a
          href={thread.href}
          data-chat-anchor=""
          aria-current={active ? "page" : undefined}
          draggable={false}
          onPointerDown={splitProps.onPointerDown}
          onClick={(event) => {
            if (event.button !== 0 || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onOpen(thread.id, event.metaKey || event.ctrlKey);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            setRenaming(true);
          }}
          style={indent}
          className={cn(
            "flex h-6 select-none items-center gap-1.5 rounded-md pr-2 text-[12px] text-sidebar-foreground no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            active ? "bg-sidebar-accent text-foreground" : "group-hover/row:bg-sidebar-accent/60",
          )}
        >
          <ChildStatus node={node} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              thread.isUnread || attention ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            <ThreadTitle threadId={thread.id} />
          </span>
          {thread.isUnread ? <span className="chat-unread size-1.5 shrink-0 rounded-full" aria-hidden="true" /> : null}
          <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
            {formatChatTime(Math.max(thread.updatedAt, thread.latestAttentionAt), now, i18n)}
          </span>
        </a>
      </ThreadActionsContextMenu>
      <RowQuickActions thread={thread} onRename={() => setRenaming(true)} />
    </div>
  );
}

/** The opened children, under their chat: a guide line on the left, one small row each. */
export function SubThreadRows({
  row,
  activeThreadId,
  now,
  compact,
  onOpen,
}: {
  row: Chat;
  activeThreadId: string | null;
  now: number;
  compact: boolean;
  onOpen: (threadId: string, split: boolean) => void;
}) {
  return (
    <li className="list-none">
      <div
        // The guide line starts under the chat's avatar.
        className={cn("mb-1 border-l border-sidebar-border", compact ? "ml-[18px]" : "ml-[26px]")}
      >
        {childTree(row).map((node) => (
          <ChildRow
            key={node.thread.id}
            node={node}
            active={node.thread.id === activeThreadId}
            now={now}
            onOpen={onOpen}
          />
        ))}
      </div>
    </li>
  );
}
