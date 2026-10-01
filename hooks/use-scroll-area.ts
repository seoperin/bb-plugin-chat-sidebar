// bb's scroll area around the list. The plugin does not own it, so it is
// found from the DOM: the nearest scrollable ancestor of `anchor`.
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

export function scrollParentOf(element: HTMLElement | null): HTMLElement | null {
  for (let current = element?.parentElement ?? null; current !== null; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
  }
  return null;
}

export function useScrollArea(anchor: RefObject<HTMLElement | null>, { trackHeight }: { trackHeight: boolean }) {
  // The visible height, for the rail that fills it and scrolls on its own.
  const [viewportHeight, setViewportHeight] = useState(0);
  useLayoutEffect(() => {
    const scroller = scrollParentOf(anchor.current);
    if (scroller === null || !trackHeight) return;
    const measure = () => setViewportHeight(scroller.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [anchor, trackHeight]);

  // "Back to top" shows once the list is scrolled about a screen down.
  const [farFromTop, setFarFromTop] = useState(false);
  useEffect(() => {
    const scroller = scrollParentOf(anchor.current);
    if (scroller === null) return;
    const update = () => setFarFromTop(scroller.scrollTop > scroller.clientHeight * 0.8);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [anchor]);

  const scrollToTop = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    scrollParentOf(anchor.current)?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return { viewportHeight, farFromTop, scrollToTop };
}
