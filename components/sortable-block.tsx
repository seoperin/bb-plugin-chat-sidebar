// One block of folders in the rail or the tabs, dragged as a unit. All is a
// block too, but it stays put.
import type { ReactNode } from "react";

import { useSortableItem } from "@/hooks/use-sortable";
import { cn } from "@/lib/utils";

export function SortableBlock({
  id,
  fixed,
  className,
  children,
}: {
  /** The layout entry id. */
  id: string;
  fixed: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, style, handleProps, isDragging } = useSortableItem(id, fixed);
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(fixed ? {} : handleProps)}
      className={cn(className, "touch-manipulation", isDragging && "rounded-xl bg-sidebar shadow-lg")}
    >
      {children}
    </div>
  );
}
