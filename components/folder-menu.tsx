// Shared folder pieces for the tab strip and the rail: the folder's label,
// "mark all as read", and the right-click menu.
import type { ReactNode } from "react";
import { toast } from "sonner";
import { experimental_useSidebarThreadActions } from "@get-bb/plugin-sdk/app";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import type { MessageKey } from "@/lib/i18n";
import { unreadIdsIn, type Chat, type Folder, type FolderId } from "@/lib/model";
import { useT } from "./chat-context";
import { ProjectColorSubmenu } from "./project-colors";

const BUILT_IN: Partial<Record<FolderId, MessageKey>> = {
  all: "folder.all",
  attention: "folder.attention",
  archive: "folder.archive",
};

export function useFolderLabel() {
  const t = useT();
  return (folder: Pick<Folder, "id" | "name" | "personal">): string => {
    const key = BUILT_IN[folder.id];
    if (key !== undefined) return t(key);
    if (folder.personal) return t("folder.personal");
    return folder.name ?? "";
  };
}

/** Mark every unread thread in a folder as read, like Telegram's "Mark as read". */
export function useMarkFolderRead(rows: readonly Chat[]) {
  const t = useT();
  const actions = experimental_useSidebarThreadActions();
  return async (folder: FolderId) => {
    const ids = unreadIdsIn(rows, folder);
    if (ids.length === 0) return;
    const results = await Promise.allSettled(ids.map((id) => actions.setRead(id, true)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) toast.error(t("toast.markReadFailed", { failed, total: ids.length }));
  };
}

/** Right-click menu of a folder: read everything, start a chat, colour a project. */
export function FolderMenu({
  folder,
  rows,
  children,
}: {
  folder: Folder;
  rows: readonly Chat[];
  children: ReactNode;
}) {
  const t = useT();
  const markRead = useMarkFolderRead(rows);
  const actions = experimental_useSidebarThreadActions();
  const unread = unreadIdsIn(rows, folder.id).length;
  const projectId = folder.id.startsWith("project:") ? folder.id.slice("project:".length) : null;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuItem disabled={unread === 0} onSelect={() => void markRead(folder.id)}>
          <Icon name="Check" />
          {unread === 0 ? t("folder.allRead") : t("folder.markRead", { count: unread })}
        </ContextMenuItem>
        {projectId !== null ? (
          <ContextMenuItem onSelect={() => actions.openNewThread({ projectId, focusPrompt: true })}>
            <Icon name="MessageSquarePlus" />
            {t("folder.newChat")}
          </ContextMenuItem>
        ) : null}
        {projectId !== null ? <ProjectColorSubmenu projectId={projectId} /> : null}
        {folder.id.startsWith("section:") ? (
          <ContextMenuItem
            onSelect={() =>
              actions.openNewThread({ sectionId: folder.id.slice("section:".length), focusPrompt: true })
            }
          >
            <Icon name="MessageSquarePlus" />
            {t("folder.newChatSection")}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
