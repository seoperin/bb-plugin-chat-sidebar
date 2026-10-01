// A chat row's context menu: everything bb's own row menu does, through
// `experimental_useSidebarThreadActions`, plus jumps to folded sub-agents.
// bb confirms deletion, and archiving a thread that has children, itself.
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  experimental_useSidebarThreadActions,
  experimental_useSidebarThreadSplit,
  useSdk,
} from "@get-bb/plugin-sdk/app";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import type { Chat } from "@/lib/model";
import { laneOf } from "@/lib/status";
import { useT } from "./chat-context";
import { ProjectColorSubmenu } from "./project-colors";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MAX_SUB_AGENTS = 8;

function report(action: Promise<unknown>, failure: string) {
  action.catch((cause: unknown) => {
    toast.error(failure, { description: cause instanceof Error ? cause.message : String(cause) });
  });
}

export function ChatMenu({
  row,
  children,
  onOpen,
  onRename,
}: {
  row: Chat;
  children: ReactNode;
  onOpen: (threadId: string, split: boolean) => void;
  onRename: () => void;
}) {
  const t = useT();
  const { thread } = row;
  const actions = experimental_useSidebarThreadActions();
  const { isAvailable: canSplit } = experimental_useSidebarThreadSplit(thread.id);
  const sdk = useSdk();
  const copyLink = () => {
    const url = new URL(thread.href, window.location.origin).toString();
    navigator.clipboard.writeText(url).then(
      () => toast.success(t("toast.linkCopied")),
      () => toast.error(t("toast.linkFailed")),
    );
  };
  const subAgents = row.children.slice(0, MAX_SUB_AGENTS);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem onSelect={() => onOpen(thread.id, false)}>
          <Icon name="ArrowUpRight" />
          {t("menu.open")}
        </ContextMenuItem>
        {canSplit ? (
          <ContextMenuItem onSelect={() => onOpen(thread.id, true)}>
            <Icon name="PanelRight" />
            {t("menu.openSplit")}
            <ContextMenuShortcut>{t("menu.splitHint", { key: IS_MAC ? "⌘" : "Ctrl" })}</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        {subAgents.length > 0 ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Icon name="Bot" />
              {t("menu.subAgents")}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-w-72">
              {subAgents.map((child) => {
                const lane = laneOf(child);
                return (
                  <ContextMenuItem key={child.id} onSelect={() => onOpen(child.id, false)}>
                    <span
                      data-lane={lane ?? undefined}
                      className="chat-lane-dot size-1.5 shrink-0 rounded-full"
                      aria-hidden="true"
                    />
                    <span className="truncate">{child.displayTitle}</span>
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onRename}>
          <Icon name="Edit" />
          {t("menu.rename")}
        </ContextMenuItem>
        {!thread.isArchived ? (
          <ContextMenuItem
            onSelect={() =>
              report(
                actions.setPinned(thread.id, !thread.isPinned),
                t(thread.isPinned ? "toast.unpinFailed" : "toast.pinFailed"),
              )
            }
          >
            <Icon name={thread.isPinned ? "PinOff" : "Pin"} />
            {t(thread.isPinned ? "menu.unpin" : "menu.pin")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onSelect={() => {
            // A folded row reads as unread when any of its threads is.
            const ids = row.unread ? row.unreadIds : [thread.id];
            report(Promise.all(ids.map((id) => actions.setRead(id, row.unread))), t("toast.readFailed"));
          }}
        >
          <Icon name={row.unread ? "Check" : "BellDot"} />
          {t(row.unread ? "menu.markRead" : "menu.markUnread")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={copyLink}>
          <Icon name="Copy" />
          {t("menu.copyLink")}
        </ContextMenuItem>
        {row.project !== null && !thread.isArchived ? (
          <ContextMenuItem onSelect={() => actions.openNewThread({ projectId: thread.projectId, focusPrompt: true })}>
            <Icon name="MessageSquarePlus" />
            {t("menu.newChat")}
          </ContextMenuItem>
        ) : null}
        {row.project !== null ? <ProjectColorSubmenu projectId={row.project.id} /> : null}
        <ContextMenuSeparator />
        {thread.isArchived ? (
          <ContextMenuItem
            onSelect={() => report(sdk.threads.unarchive({ threadId: thread.id }), t("toast.unarchiveFailed"))}
          >
            <Icon name="ArchiveRestore" />
            {t("menu.unarchive")}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onSelect={() => actions.archive(thread.id)}>
            <Icon name="Archive" />
            {t("menu.archive")}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() => actions.requestDelete(thread.id)}
          className="text-destructive focus:text-destructive"
        >
          <Icon name="Trash2" />
          {t("menu.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
