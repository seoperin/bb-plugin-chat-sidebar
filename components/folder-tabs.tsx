// Folder tabs above the list, in the user's order and dragged to reorder,
// with the button that opens the folder editor at the end.
// The strip scrolls sideways (a mouse wheel scrolls it too), fades an edge
// while there is more that way, and keeps the active tab in view.
import { useEffect, useRef, useState } from "react";
import { DndContext } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";

import { Icon } from "@/components/ui/icon";
import { folderBlocks, type Chat, type Folder, type FolderId } from "@/lib/model";
import { cn } from "@/lib/utils";
import { useT } from "./chat-context";
import { FolderMenu, useFolderLabel } from "./folder-menu";
import { useFolderDnd, useFolders } from "./folders-context";
import { SortableBlock } from "./sortable-block";

export function FolderTabs({
  folders,
  rows,
  active,
  onSelect,
}: {
  folders: readonly Folder[];
  rows: readonly Chat[];
  active: FolderId;
  onSelect: (id: FolderId) => void;
}) {
  const t = useT();
  const label = useFolderLabel();
  const { openEditor } = useFolders();
  const stripRef = useRef<HTMLElement>(null);
  const dnd = useFolderDnd("horizontal");
  const blocks = folderBlocks(folders);

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
      <DndContext {...dnd.dndContextProps}>
        <SortableContext
          items={blocks.filter((block) => block.entryId !== "all").map((block) => block.entryId)}
          strategy={horizontalListSortingStrategy}
        >
          {blocks.map((block) => (
            <SortableBlock
              key={block.entryId}
              id={block.entryId}
              fixed={block.entryId === "all"}
              className="flex shrink-0 gap-1 rounded-full"
            >
              {block.folders.map((folder) => {
                const selected = folder.id === active;
                return (
                  <FolderMenu key={folder.id} folder={folder} rows={rows}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelect(folder.id)}
                      className={cn(
                        "relative flex h-6 max-w-40 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-full px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
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
            </SortableBlock>
          ))}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        title={t("folders.edit")}
        aria-label={t("folders.edit")}
        onClick={() => openEditor(null)}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="SlidersHorizontal" className="size-3.5" />
      </button>
    </nav>
  );
}
