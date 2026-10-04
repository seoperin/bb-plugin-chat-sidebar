// Shared folder pieces for the tab strip and the rail: the folder's label,
// "mark all as read", and the right-click menu.
import type { ReactNode } from "react";
import { toast } from "sonner";
import { experimental_useSidebarThreadActions } from "@get-bb/plugin-sdk/app";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import type { EntryKind } from "@/lib/folders";
import type { MessageKey } from "@/lib/i18n";
import { unreadIdsIn, type Chat, type Folder } from "@/lib/model";
import { useT } from "./chat-context";
import { useFolders } from "./folders-context";
import { ProjectColorSubmenu } from "./project-colors";

const BUILT_IN: Partial<Record<EntryKind, MessageKey>> = {
  all: "folder.all",
  attention: "folder.attention",
  archive: "folder.archive",
  projects: "folders.kind.projects",
  sections: "folders.kind.sections",
  custom: "folders.new",
};

/**
 * A folder's or a layout entry's name: what the user typed, else the
 * project's or section's, else the translated built-in name.
 */
export function useFolderLabel() {
  const t = useT();
  return (folder: { name: string | null; personal?: boolean; kind: EntryKind }): string => {
    if (folder.personal === true) return t("folder.personal");
    if (folder.name !== null && folder.name.trim() !== "") return folder.name;
    const key = BUILT_IN[folder.kind];
    return key === undefined ? "" : t(key);
  };
}

/** Mark every unread thread in a folder as read, like Telegram's "Mark as read". */
function useMarkFolderRead(rows: readonly Chat[]) {
  const t = useT();
  const actions = experimental_useSidebarThreadActions();
  return async (folder: Folder) => {
    const ids = unreadIdsIn(rows, folder);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => actions.setRead(id, true)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) toast.error(t("toast.markReadFailed", { failed, total: ids.length }));
  };
}

/** Right-click menu of a folder: read everything, start a chat, colour a project, edit. */
export function FolderMenu({ folder, rows, children }: { folder: Folder; rows: readonly Chat[]; children: ReactNode }) {
  const t = useT();
  const markRead = useMarkFolderRead(rows);
  const actions = experimental_useSidebarThreadActions();
  const { openEditor } = useFolders();
  const label = useFolderLabel();
  const unread = unreadIdsIn(rows, folder).length;
  const projectId = folder.id.startsWith("project:") ? folder.id.slice("project:".length) : null;
  // A custom folder about one project (or section) starts its chats there, like "+".
  const startIn = folder.kind === "custom" ? folder.startIn : null;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem disabled={unread === 0} onSelect={() => void markRead(folder)}>
          <Icon name="Check" />
          {unread === 0 ? t("folder.allRead") : t("folder.markRead", { count: unread })}
        </ContextMenuItem>
        {projectId !== null ? (
          <ContextMenuItem onSelect={() => actions.openNewThread({ projectId, focusPrompt: true })}>
            <Icon name="MessageSquarePlus" />
            {t("folder.newChat")}
          </ContextMenuItem>
        ) : null}
        {startIn !== null ? (
          <ContextMenuItem onSelect={() => actions.openNewThread({ ...startIn, focusPrompt: true })}>
            <Icon name="MessageSquarePlus" />
            {t("newChat.in", { name: label(folder) })}
          </ContextMenuItem>
        ) : null}
        {projectId !== null || folder.linkedProjectId !== null ? (
          <ProjectColorSubmenu projectId={projectId ?? folder.linkedProjectId!} />
        ) : null}
        {folder.id.startsWith("section:") ? (
          <ContextMenuItem
            onSelect={() => actions.openNewThread({ sectionId: folder.id.slice("section:".length), focusPrompt: true })}
          >
            <Icon name="MessageSquarePlus" />
            {t("folder.newChatSection")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => openEditor(folder.entryId)}>
          <Icon name="Edit" />
          {t("folders.editOne")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => openEditor(null)}>
          <Icon name="SlidersHorizontal" />
          {t("folders.edit")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
