"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Horizontal, keyboard-navigable scroller with edge fades and chevron buttons
 * that appear only when there's more content in that direction — so users can
 * tell the row overflows. Arrow keys scroll it when focused.
 */
export function HScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setLeft(el.scrollLeft > 4);
    setRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  const scrollBy = (dir: number) => ref.current?.scrollBy({ left: dir * 0.85 * (ref.current?.clientWidth ?? 600), behavior: "smooth" });

  return (
    <div className="relative">
      {/* edge fades + chevrons only matter on md+, where the row scrolls */}
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-16 bg-gradient-to-r from-slate-950 to-transparent transition-opacity md:block ${left ? "opacity-100" : "opacity-0"}`}
      />
      {left && <ChevronButton side="left" onClick={() => scrollBy(-1)} />}

      <div
        ref={ref}
        onScroll={update}
        tabIndex={0}
        role="region"
        aria-label="Simulation results — scroll horizontally for more"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            scrollBy(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            scrollBy(-1);
          }
        }}
        className="no-scrollbar flex flex-col gap-4 outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/40 md:flex-row md:gap-6 md:snap-x md:snap-mandatory md:overflow-x-auto md:scroll-smooth md:pb-2"
      >
        {children}
      </div>

      <div
        className={`pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-16 bg-gradient-to-l from-slate-950 to-transparent transition-opacity md:block ${right ? "opacity-100" : "opacity-0"}`}
      />
      {right && <ChevronButton side="right" onClick={() => scrollBy(1)} />}
    </div>
  );
}

function ChevronButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      className={`absolute top-1/2 z-20 hidden -translate-y-1/2 ${side === "left" ? "left-2" : "right-2"} h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-slate-200 shadow-lg backdrop-blur transition hover:border-emerald-500/60 hover:text-emerald-300 md:inline-flex`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {side === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}
