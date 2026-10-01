// Folder tabs above the list: All, Attention, projects, sections, Archive.
// The strip scrolls sideways (a mouse wheel scrolls it too) and keeps the
// active tab in view. Right-click a tab to read everything in it or, for a
// project, start a new chat there.
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { unreadIdsIn, type ChatRow, type Folder, type FolderId } from "@/lib/model";
import { cn } from "@/lib/utils";
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
export function useMarkFolderRead(rows: readonly ChatRow[]) {
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
  rows: readonly ChatRow[];
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

export function FolderTabs({
  folders,
  rows,
  active,
  onSelect,
}: {
  folders: readonly Folder[];
  rows: readonly ChatRow[];
  active: FolderId;
  onSelect: (id: FolderId) => void;
}) {
  const t = useT();
  const label = useFolderLabel();
  const stripRef = useRef<HTMLElement>(null);

  // A vertical wheel scrolls the strip sideways; React's onWheel is passive.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (strip.scrollWidth <= strip.clientWidth) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  // Fade an edge only while there is more to scroll that way.
  const [overflow, setOverflow] = useState({ start: false, end: false });
  useEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return;
    const update = () => {
      const start = strip.scrollLeft > 1;
      const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
      setOverflow((current) => (current.start === start && current.end === end ? current : { start, end }));
    };
    update();
    strip.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(strip);
    return () => {
      strip.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [folders.length]);

  useEffect(() => {
    const tab = stripRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav
      ref={stripRef}
      aria-label={t("folder.tabs")}
      data-fade-start={overflow.start || undefined}
      data-fade-end={overflow.end || undefined}
      className="chat-tab-strip flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {folders.map((folder) => {
        const selected = folder.id === active;
        return (
          <FolderMenu key={folder.id} folder={folder} rows={rows}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(folder.id)}
              className={cn(
                "flex h-6 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "bg-foreground text-background"
                  : "bg-sidebar-accent/70 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              {folder.lane !== null ? (
                <span
                  data-lane={folder.lane}
                  aria-hidden="true"
                  className="chat-lane-dot size-1.5 shrink-0 rounded-full"
                />
              ) : null}
              <span className="truncate">{label(folder)}</span>
              {folder.lane !== null ? (
                <span className="sr-only">
                  {`, ${t(folder.lane === "attention" ? "folder.hasWaiting" : "folder.hasWorking")}`}
                </span>
              ) : null}
              {folder.badge > 0 ? (
                <span
                  className={cn(
                    "grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                    selected ? "bg-background text-foreground" : "bg-muted-foreground/20",
                  )}
                >
                  {folder.badge}
                </span>
              ) : null}
            </button>
          </FolderMenu>
        );
      })}
    </nav>
  );
}
