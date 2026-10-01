// Rows render a page at a time: the next page as the end of the list comes
// near, and back to the first page once the list returns to the top, so a
// long scroll does not keep hundreds of rows mounted. Observers use bb's
// scroll area as their root, so the look-ahead margin applies inside it.
import { useEffect, useRef, useState } from "react";

import { scrollParentOf } from "./use-scroll-area";

export function usePaging(total: number, pageSize: number, resetKey: string) {
  const [limit, setLimit] = useState(pageSize);
  const endRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => setLimit(pageSize), [resetKey, pageSize]);

  const visible = Math.min(limit, total);
  useEffect(() => {
    const sentinel = endRef.current;
    if (sentinel === null || visible >= total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => value + pageSize);
      },
      { root: scrollParentOf(sentinel), rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible, total, pageSize]);

  const paged = limit > pageSize;
  useEffect(() => {
    const sentinel = topRef.current;
    if (sentinel === null || !paged) return;
    // Only a return to the top resets: on a screen taller than one page the
    // top stays visible while the next page loads, and resetting then would loop.
    let leftTop = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) leftTop = true;
        else if (leftTop) setLimit(pageSize);
      },
      { root: scrollParentOf(sentinel) },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [paged, pageSize]);

  return { limit, hasMore: visible < total, endRef, topRef };
}
