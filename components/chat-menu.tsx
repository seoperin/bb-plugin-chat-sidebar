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
import { customEntry, hasFilters, MAX_CUSTOM_FOLDERS, type FolderRule } from "@/lib/folders";
import { matchesRule, type Chat } from "@/lib/model";
import { laneOf } from "@/lib/status";
import { useT } from "./chat-context";
import { useFolderLabel } from "./folder-menu";
import { useFolders } from "./folders-context";
import { ProjectColorSubmenu } from "./project-colors";

/**
 * Put a chat in a custom folder or take it out. Taking out a chat that the
 * folder's filters pick excludes it by hand, the way Telegram does.
 */
function withChat(rule: FolderRule, row: Chat, include: boolean): FolderRule {
  const id = row.thread.id;
  const chats = rule.chats.filter((chat) => chat !== id);
  const excludeChats = rule.excludeChats.filter((chat) => chat !== id);
  if (include) return { ...rule, chats: [...chats, id], excludeChats };
  const stillPicked = hasFilters(rule) && matchesRule(row, { ...rule, chats, excludeChats }, Date.now());
  return { ...rule, chats, excludeChats: stillPicked ? [...excludeChats, id] : excludeChats };
}

/** "Add to folder": every custom folder with a tick where the chat is in. */
function FolderSubmenu({ row }: { row: Chat }) {
  const t = useT();
  const label = useFolderLabel();
  const { layout, setLayout, updateEntry, openEditor } = useFolders();
  const custom = layout.entries.filter((entry) => entry.kind === "custom" && entry.rule !== null);
  const now = Date.now();
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Icon name="FolderPlus" />
        {t("menu.addToFolder")}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-48 max-w-72">
        {custom.map((entry) => {
          const rule = entry.rule!;
          const inside = matchesRule(row, rule, now);
          return (
            <ContextMenuItem
              key={entry.id}
              onSelect={() => updateEntry(entry.id, { rule: withChat(rule, row, !inside) })}
            >
              <Icon name={entry.icon ?? "Folder"} />
              <span className="flex-1 truncate">{label(entry)}</span>
              {inside ? <Icon name="Check" className="size-3.5" /> : null}
            </ContextMenuItem>
          );
        })}
        {custom.length > 0 ? <ContextMenuSeparator /> : null}
        <ContextMenuItem
          disabled={custom.length >= MAX_CUSTOM_FOLDERS}
          onSelect={() => {
            const entry = customEntry(t("folders.new"), "Folder", { chats: [row.thread.id] });
            setLayout({ ...layout, entries: [...layout.entries, entry] });
            openEditor(entry.id, { focusName: true });
          }}
        >
          <Icon name="Plus" />
          {t("menu.newFolderWith")}
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

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
        {thread.isArchived ? null : <FolderSubmenu row={row} />}
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
