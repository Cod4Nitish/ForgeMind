import { useEffect, useRef, useState } from "react";

/*
 * No "use client" directive: only imported by components of the interactive
 * CommandCenter, so it already lives in the client graph.
 */

/**
 * Whether an internal scroll region currently has anything to scroll. A
 * region is a keyboard tab stop (and a named landmark) only while its content
 * overflows it, so short lists add no empty focus stops.
 *
 * Starts `true` (focusable, the safe default before measuring and when
 * ResizeObserver is unavailable), then follows the real size of the box and
 * of its content.
 */
export function useScrollable<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [scrollable, setScrollable] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setScrollable(element.scrollHeight > element.clientHeight + 1);
    });
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);

  return [ref, scrollable] as const;
}
