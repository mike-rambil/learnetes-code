"use client";

import { useEffect } from "react";
import { LEARN, type LearnKey } from "@/lib/learn";

/** Slide-over drawer with deep-dive learning content for a topology resource. */
export function LearnDrawer({
  entryKey,
  onClose,
}: {
  entryKey: LearnKey | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!entryKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entryKey, onClose]);

  if (!entryKey) return null;
  const entry = LEARN[entryKey];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={entry.title}>
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 p-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              Resource
            </div>
            <h4 className="mt-1 text-lg font-bold text-slate-100">{entry.title}</h4>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-sm leading-relaxed text-slate-300">{entry.long}</p>
        </div>

        <div className="border-t border-slate-800 p-5">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Keep learning — free official docs
          </div>
          <a
            href={entry.docUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            {entry.docLabel} ↗
          </a>
        </div>
      </aside>
    </div>
  );
}
