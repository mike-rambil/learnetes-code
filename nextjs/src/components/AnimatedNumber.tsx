"use client";

import { useEffect, useRef, useState } from "react";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Tweens from its previous value to the next whenever `value` changes, and
 * briefly highlights to draw the eye. Used for the cost/carbon figures so the
 * numbers visibly react as the manifest is edited.
 */
export function AnimatedNumber({
  value,
  format = (n) => n.toLocaleString(),
  duration = 600,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const raf = useRef<number | null>(null);
  const popRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    // retrigger the highlight pulse
    const el = popRef.current;
    if (el) {
      el.classList.remove("value-pop");
      void el.offsetWidth; // force reflow so the animation restarts
      el.classList.add("value-pop");
    }

    if (prefersReduced()) {
      fromRef.current = to;
      raf.current = requestAnimationFrame(() => setDisplay(to));
      return () => {
        if (raf.current) cancelAnimationFrame(raf.current);
      };
    }

    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setDisplay(from + (to - from) * ease(p));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return (
    <span ref={popRef} className={className}>
      {format(display)}
    </span>
  );
}
