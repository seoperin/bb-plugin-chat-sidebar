// Drag pinned chats to reorder them, with pointer events rather than HTML
// drag and drop: bb's split drag listens to the same pointer stream and takes
// over once the pointer leaves the sidebar, so the two gestures coexist. A
// native drag would swallow those events and break splitting.
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

const THRESHOLD_PX = 5;

export interface PinDragState {
  dragging: string | null;
  hint: { id: string; place: "before" | "after" } | null;
}

interface Pending {
  id: string;
  pointerId: number;
  startY: number;
  active: boolean;
}

export function usePinReorder(
  listRef: React.RefObject<HTMLElement | null>,
  onDrop: (dragged: string, target: string, place: "before" | "after") => void,
) {
  const [state, setState] = useState<PinDragState>({ dragging: null, hint: null });
  const pending = useRef<Pending | null>(null);
  const hintRef = useRef<PinDragState["hint"]>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const reset = useCallback(() => {
    pending.current = null;
    hintRef.current = null;
    setState({ dragging: null, hint: null });
  }, []);

  useEffect(() => {
    const onMove = (event: globalThis.PointerEvent) => {
      const drag = pending.current;
      if (drag === null || event.pointerId !== drag.pointerId) return;
      if (!drag.active) {
        if (Math.abs(event.clientY - drag.startY) < THRESHOLD_PX) return;
        drag.active = true;
        setState({ dragging: drag.id, hint: null });
      }
      const list = listRef.current;
      const bounds = list?.getBoundingClientRect();
      // Out of the list sideways: that is a split drag, which bb owns.
      if (bounds === undefined || event.clientX < bounds.left || event.clientX > bounds.right) {
        hintRef.current = null;
        setState({ dragging: drag.id, hint: null });
        return;
      }
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-chat-pin]");
      const id = target?.dataset.chatPin;
      if (target == null || id === undefined || id === drag.id || !list?.contains(target)) {
        return;
      }
      const rect = target.getBoundingClientRect();
      const place = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      if (hintRef.current?.id === id && hintRef.current.place === place) return;
      hintRef.current = { id, place };
      setState({ dragging: drag.id, hint: { id, place } });
    };
    const onUp = (event: globalThis.PointerEvent) => {
      const drag = pending.current;
      if (drag === null || event.pointerId !== drag.pointerId) return;
      const hint = hintRef.current;
      if (drag.active) {
        // The click that follows a drag must not open the chat.
        const swallow = (click: MouseEvent) => {
          click.preventDefault();
          click.stopPropagation();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
        if (hint !== null) onDropRef.current(drag.id, hint.id, hint.place);
      }
      reset();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && pending.current?.active) reset();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", reset);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", reset);
      window.removeEventListener("keydown", onKey);
    };
  }, [listRef, reset]);

  const start = useCallback((id: string, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    pending.current = { id, pointerId: event.pointerId, startY: event.clientY, active: false };
  }, []);

  return { state, start };
}
