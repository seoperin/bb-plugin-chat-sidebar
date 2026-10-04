// Drag to reorder, the way bb's own sidebar does it (plugins/navigation and
// plugins/thread-list in get-bb/bb): @dnd-kit, the neighbours making room as
// the item moves, a mouse drag after 8px, a finger after a short hold, the
// keyboard with Space and the arrows, and no click after a drag (see
// `swallowNextClick`).
//
// A held finger and a long press share one gesture, so after the hold the item
// lifts and the context menu's own long-press timer is cancelled; moving drags
// it, letting go without moving opens the menu instead.
//
// dnd-kit listens to mouse and touch events, so it leaves the pointer events
// to bb's split drag on the same row: dragged out of the sidebar, a chat still
// opens in a split.
import { useEffect, useMemo, useRef, type CSSProperties, type HTMLAttributes } from "react";
import {
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DndContextProps,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCode,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const MOUSE_DISTANCE_PX = 8;
const TOUCH_HOLD_MS = 250;
const TOUCH_TOLERANCE_PX = 6;
const CLICK_SUPPRESSION_MS = 350;
const TRANSITION = { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" };

// Space lifts and drops; Enter is left to open the row, as it would without dragging.
const KEYBOARD_CODES = {
  start: ["Space"] as KeyboardCode[],
  cancel: ["Escape"] as KeyboardCode[],
  end: ["Space", "Enter"] as KeyboardCode[],
};

const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : closestCenter(args);
};

const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const horizontal: Modifier = ({ transform }) => ({ ...transform, y: 0 });

/** A touch sensor that keeps the page from scrolling under a dragged item. */
class HoldTouchSensor extends TouchSensor {
  static override setup(): () => void {
    const keepTouchMoveCancelable = () => {};
    window.addEventListener("touchmove", keepTouchMoveCancelable, { capture: false, passive: false });
    return () => window.removeEventListener("touchmove", keepTouchMoveCancelable);
  }
}

/**
 * The click a drop ends with must not reach the item: on a chat row it would
 * follow the link and load the page. It is caught on the window, before
 * anything else: the drop reorders the list, and a row moved up is re-inserted
 * into the DOM before the click is dispatched, so a handler on the list may
 * never see it.
 */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), CLICK_SUPPRESSION_MS);
}

function setDraggingCursor(active: boolean) {
  // bb's own stylesheet shows the grabbing cursor across the sidebar for this.
  if (active) document.body.dataset.sidebarDragging = "true";
  else delete document.body.dataset.sidebarDragging;
}

function sortableIndex(data: unknown): number | null {
  const index = (data as { sortable?: { index?: unknown } } | undefined)?.sortable?.index;
  return typeof index === "number" ? index : null;
}

/**
 * The DndContext props for one sortable list. `onMove` gets the dragged id,
 * the id it was dropped on, and which side of it it lands on.
 */
export function useReorderDnd({
  axis,
  onMove,
}: {
  axis: "vertical" | "horizontal";
  onMove: (draggedId: string, targetId: string, place: "before" | "after") => void;
}) {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const touchStart = useRef<{ target: EventTarget | null; x: number; y: number } | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
    useSensor(HoldTouchSensor, { activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: TOUCH_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: KEYBOARD_CODES }),
  );

  useEffect(() => () => setDraggingCursor(false), []);

  const dndContextProps = useMemo<
    Pick<DndContextProps, "sensors" | "collisionDetection" | "modifiers" | "onDragStart" | "onDragCancel" | "onDragEnd">
  >(
    () => ({
      sensors,
      collisionDetection,
      modifiers: [axis === "vertical" ? vertical : horizontal],
      onDragStart: (event: DragStartEvent) => {
        setDraggingCursor(true);
        const start = event.activatorEvent;
        if (typeof TouchEvent !== "undefined" && start instanceof TouchEvent && start.touches[0] !== undefined) {
          const touch = start.touches[0];
          touchStart.current = { target: start.target, x: touch.clientX, y: touch.clientY };
          navigator.vibrate?.(10);
          // The menu's long-press timer stops at a touch move; the lift is one.
          start.target?.dispatchEvent(
            new PointerEvent("pointermove", { bubbles: true, pointerType: "touch", pointerId: -1 }),
          );
        } else {
          touchStart.current = null;
        }
      },
      onDragCancel: () => {
        setDraggingCursor(false);
        swallowNextClick();
      },
      onDragEnd: (event: DragEndEvent) => {
        setDraggingCursor(false);
        swallowNextClick();
        const { active, over, delta } = event;
        const held = touchStart.current;
        touchStart.current = null;
        if (over !== null && over.id !== active.id) {
          const from = sortableIndex(active.data.current);
          const to = sortableIndex(over.data.current);
          const place = from !== null && to !== null && from < to ? "after" : "before";
          onMoveRef.current(String(active.id), String(over.id), place);
          return;
        }
        // Held and let go without moving: the menu the lift held back.
        if (held !== null && Math.hypot(delta.x, delta.y) < TOUCH_TOLERANCE_PX) {
          held.target?.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: held.x, clientY: held.y }),
          );
        }
      },
    }),
    [axis, sensors],
  );

  return { dndContextProps };
}

export interface SortableBindings {
  setNodeRef: (element: HTMLElement | null) => void;
  style: CSSProperties;
  /** Spread on the element the drag starts from. */
  handleProps: HTMLAttributes<HTMLElement>;
  isDragging: boolean;
}

/** One sortable item. Its element keeps its own tab stop and role. */
export function useSortableItem(id: UniqueIdentifier, disabled = false): SortableBindings {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id,
    disabled,
    transition: TRANSITION,
  });
  const style = useMemo<CSSProperties>(
    () => ({
      transform: CSS.Translate.toString(transform),
      transition,
      position: isDragging ? "relative" : undefined,
      zIndex: isDragging ? 100 : undefined,
      opacity: isDragging ? 0.85 : undefined,
    }),
    [isDragging, transform, transition],
  );
  const handleProps = useMemo(() => {
    // The row is already focusable and has its own role; only the description stays.
    const { role: _role, tabIndex: _tabIndex, ...rest } = attributes;
    return { ...rest, ...(listeners ?? {}) } as HTMLAttributes<HTMLElement>;
  }, [attributes, listeners]);
  return { setNodeRef, style, handleProps, isDragging };
}
