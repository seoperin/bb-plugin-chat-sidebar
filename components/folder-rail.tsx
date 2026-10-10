// Folders as a narrow rail on the left, like Telegram's folder sidebar: an
// icon with its name underneath, a badge for unread chats, and a dot for the
// most urgent status. Projects show their colour and initial, the same as
// their chats' avatars. With names turned off the rail keeps only the icons,
// laid out the way Discord's server rail is: larger squares with room between
// them, and badges cut out of the square's corner. The name stays in the tooltip and for
// screen readers. The rail scrolls on its own, independently of the list, and
// ends with the button that opens the folder editor. Folders are dragged to
// reorder, a folder per project or per section as one block.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { Icon } from "@/components/ui/icon";
import { folderBlocks, type Chat, type Folder, type FolderId } from "@/lib/model";
import { cn } from "@/lib/utils";
import { useChat, useT } from "./chat-context";
import { FolderGlyph } from "./folder-glyph";
import { FolderMenu, useFolderLabel } from "./folder-menu";
import { useFolderDnd, useFolders } from "./folders-context";
import { SortableBlock } from "./sortable-block";

function RailFolder({
  folder,
  rows,
  selected,
  showName,
  onSelect,
}: {
  folder: Folder;
  rows: readonly Chat[];
  selected: boolean;
  showName: boolean;
  onSelect: (id: FolderId) => void;
}) {
  const t = useT();
  const name = useFolderLabel()(folder);
  return (
    <FolderMenu folder={folder} rows={rows}>
      <button
        type="button"
        aria-pressed={selected}
        title={name}
        onClick={() => onSelect(folder.id)}
        className={cn(
          "group relative flex w-full cursor-pointer select-none flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          showName ? "gap-1 px-1 py-1.5" : "py-1",
        )}
      >
        <span className="relative flex w-full justify-center">
          <span className="relative">
            <FolderGlyph
              kind={folder.kind}
              icon={folder.icon}
              color={folder.color}
              projectId={folder.id.startsWith("project:") ? folder.id.slice("project:".length) : null}
              colorProjectId={folder.linkedProjectId}
              label={name}
              selected={selected}
              size={showName ? "md" : "lg"}
            />
            {folder.badge > 0 ? (
              <span
                className={cn(
                  "absolute grid place-items-center rounded-full bg-[color:var(--chat-working)] font-semibold tabular-nums text-white ring-[3px] ring-sidebar",
                  showName
                    ? "-right-1.5 -top-1.5 h-4 min-w-4 px-1 text-[10px]"
                    : "-bottom-1 -right-1 h-[18px] min-w-[18px] px-1 text-[11px]",
                )}
              >
                {folder.badge}
              </span>
            ) : null}
            {folder.lane !== null ? (
              <span
                data-lane={folder.lane}
                aria-hidden="true"
                className={cn(
                  "chat-lane-dot absolute rounded-full ring-[3px] ring-sidebar",
                  showName ? "-bottom-0.5 -right-0.5 size-2.5" : "-right-0.5 -top-0.5 size-3",
                )}
              />
            ) : null}
          </span>
        </span>
        <span
          className={cn(
            showName ? "w-full truncate text-center text-[10px] leading-3" : "sr-only",
            selected ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {name}
        </span>
        {folder.lane !== null ? (
          <span className="sr-only">{`, ${t(folder.lane === "attention" ? "folder.hasWaiting" : "folder.hasWorking")}`}</span>
        ) : null}
      </button>
    </FolderMenu>
  );
}

export function FolderRail({
  folders,
  rows,
  active,
  height,
  onSelect,
  top,
}: {
  folders: readonly Folder[];
  rows: readonly Chat[];
  active: FolderId;
  /** The visible height of bb's scroll area: the rail fills it and scrolls inside. */
  height: number;
  onSelect: (id: FolderId) => void;
  /** Sits above the folders on the search row's level, so both columns start together. */
  top?: ReactNode;
}) {
  const t = useT();
  const { settings } = useChat();
  const showNames = settings.folderNames;
  const { openEditor } = useFolders();
  const railRef = useRef<HTMLElement>(null);
  const dnd = useFolderDnd("vertical");
  const blocks = folderBlocks(folders);

  useEffect(() => {
    const item = railRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    item?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  return (
    <div
      style={{ height: height > 0 ? `${height}px` : undefined } as CSSProperties}
      className={cn(
        "sticky top-0 flex shrink-0 flex-col self-start border-r border-sidebar-border",
        showNames ? "w-16" : "w-[60px]",
      )}
    >
      {/* Same box as the search row: pt-1, a 28px control, pb-2. */}
      {top !== undefined ? <div className="flex shrink-0 justify-center pb-2 pt-1">{top}</div> : null}
      {top !== undefined && !showNames ? (
        <div aria-hidden="true" className="mx-auto mb-2 h-0.5 w-8 shrink-0 rounded-full bg-foreground/15" />
      ) : null}
      <nav
        ref={railRef}
        aria-label={t("folder.tabs")}
        className="flex min-h-0 flex-1 flex-col items-stretch overflow-y-auto overscroll-contain pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <DndContext {...dnd.dndContextProps}>
          <SortableContext
            items={blocks.filter((block) => block.entryId !== "all").map((block) => block.entryId)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((block) => (
              <SortableBlock
                key={block.entryId}
                id={block.entryId}
                fixed={block.entryId === "all"}
                className={cn("flex flex-col", showNames ? "gap-0.5 py-px" : "gap-1 py-0.5")}
              >
                {block.folders.map((folder) => (
                  <RailFolder
                    key={folder.id}
                    folder={folder}
                    rows={rows}
                    selected={folder.id === active}
                    showName={showNames}
                    onSelect={onSelect}
                  />
                ))}
              </SortableBlock>
            ))}
          </SortableContext>
        </DndContext>
      </nav>
      {/* Like Telegram's folder settings, at the foot of the rail. */}
      <button
        type="button"
        title={t("folders.edit")}
        aria-label={t("folders.edit")}
        onClick={() => openEditor(null)}
        className="group flex shrink-0 cursor-pointer flex-col items-center gap-1 border-t border-sidebar-border px-1 py-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="SlidersHorizontal" className="size-4" />
        {showNames ? <span className="text-[10px] leading-3">{t("folders.title")}</span> : null}
      </button>
    </div>
  );
}
