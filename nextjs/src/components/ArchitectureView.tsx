"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Topology } from "@/lib/topology";
import type { Scenario } from "@/lib/types";
import { LEARN, type LearnKey } from "@/lib/learn";
import { LearnDrawer } from "@/components/LearnDrawer";

// React Flow is heavy and browser-only — load it lazily, only when the
// canvas view is opened, so the default static view stays lightweight.
const TopologyCanvas = dynamic(
  () => import("@/components/TopologyCanvas").then((m) => m.TopologyCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[460px] items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-sm text-slate-500">
        Loading canvas…
      </div>
    ),
  },
);

type ViewMode = "static" | "canvas";

interface Props {
  scenario: Scenario;
  topology: Topology;
  hpaPresent: boolean;
  hpaMin?: number;
  hpaMax?: number;
  /** When true, the simulator is driving live values — show a LIVE badge. */
  live?: boolean;
}

export function ArchitectureView({ scenario, topology, hpaPresent, hpaMin, hpaMax, live }: Props) {
  const [selected, setSelected] = useState<LearnKey | null>(null);
  const [hovered, setHovered] = useState<LearnKey | null>(null);
  const [view, setView] = useState<ViewMode>("canvas");

  const learn = { hovered, setHovered, onSelect: setSelected };

  const nodes = Array.from({ length: topology.nodeCount }, (_, i) => {
    const podsInThisNode = Math.min(
      topology.podsPerNode,
      topology.effectiveReplicas - i * topology.podsPerNode,
    );
    return { id: i, pods: podsInThisNode };
  });

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Live cluster topology
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase">
          {live && (
            <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-red-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              Live
            </span>
          )}
          <ViewToggle view={view} onChange={setView} />
          <span className="normal-case text-slate-500">Hover to learn · click for details</span>
          {topology.hpaActive && (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">
              HPA active
            </span>
          )}
          {topology.hpaSaturated && (
            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-300">
              HPA at max
            </span>
          )}
          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-300">
            {topology.capacityUtilizationPercent.toFixed(0)}% capacity
          </span>
        </div>
      </div>

      {view === "canvas" ? (
        <TopologyCanvas
          scenario={scenario}
          topology={topology}
          hpaPresent={hpaPresent}
          hpaMin={hpaMin}
          hpaMax={hpaMax}
        />
      ) : (
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_2fr] items-stretch gap-2">
        <Column
          learnKey="traffic"
          {...learn}
          title="Traffic"
          subtitle={`${scenario.requestsPerSecond.toLocaleString()} RPS`}
          tone="amber"
        >
          <TrafficGlyph rps={scenario.requestsPerSecond} />
        </Column>

        <Arrow />

        <Column learnKey="ingress" {...learn} title="Ingress" subtitle="ALB" tone="slate">
          <LBGlyph />
        </Column>

        <Arrow />

        <Column
          learnKey="controlPlane"
          {...learn}
          title="Control plane"
          subtitle={hpaPresent ? "Deployment + HPA" : "Deployment"}
          tone="violet"
        >
          <Learnable entryKey="deployment" {...learn}>
            <ManifestGlyph label="Deployment" />
          </Learnable>
          {hpaPresent && (
            <Learnable entryKey="hpa" {...learn}>
              <ManifestGlyph label={`HPA ${hpaMin}-${hpaMax}`} tone="emerald" />
            </Learnable>
          )}
        </Column>

        <Arrow />

        <Column
          learnKey="node"
          {...learn}
          title={`${topology.nodeCount} node${topology.nodeCount === 1 ? "" : "s"}`}
          subtitle={`${topology.effectiveReplicas} pod${topology.effectiveReplicas === 1 ? "" : "s"}`}
          tone="emerald"
        >
          <div className="flex flex-wrap gap-2">
            {nodes.map((node) => (
              <NodeBox
                key={node.id}
                podCount={node.pods}
                capacity={topology.podsPerNode}
                learn={learn}
              />
            ))}
          </div>
        </Column>
      </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs lg:grid-cols-4">
        <Stat label="Base replicas" value={topology.baseReplicas.toString()} />
        <Stat
          label="Desired (traffic)"
          value={`${topology.desiredReplicas} pod${topology.desiredReplicas === 1 ? "" : "s"}`}
          hint={`${topology.rpsPerPod} RPS/pod`}
        />
        <Stat label="Effective" value={topology.effectiveReplicas.toString()} hint="after HPA" />
        <Stat label="Nodes" value={topology.nodeCount.toString()} hint={`${topology.podsPerNode} pods/node`} />
      </div>

      <LearnDrawer entryKey={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

interface LearnHandlers {
  hovered: LearnKey | null;
  setHovered: (k: LearnKey | null) => void;
  onSelect: (k: LearnKey) => void;
}

function Learnable({
  entryKey,
  hovered,
  setHovered,
  onSelect,
  children,
  className,
}: LearnHandlers & {
  entryKey: LearnKey;
  children: React.ReactNode;
  className?: string;
}) {
  const entry = LEARN[entryKey];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Learn about ${entry.title}`}
      onMouseEnter={() => setHovered(entryKey)}
      onMouseLeave={() => setHovered(hovered === entryKey ? null : hovered)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(entryKey);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(entryKey);
        }
      }}
      className={`group relative cursor-pointer rounded-lg outline-none transition hover:brightness-125 focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${className ?? ""}`}
    >
      {children}
      {hovered === entryKey && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-[200px] -translate-x-1/2 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-slate-200 shadow-xl">
          <span className="block font-semibold text-slate-100">{entry.title}</span>
          <span className="block text-slate-300">{entry.short}</span>
          <span className="mt-0.5 block text-[10px] text-emerald-300">Click to learn more →</span>
        </div>
      )}
    </div>
  );
}

function Column({
  title,
  subtitle,
  tone,
  children,
  learnKey,
  ...learn
}: LearnHandlers & {
  title: string;
  subtitle: string;
  tone: "amber" | "slate" | "violet" | "emerald";
  children: React.ReactNode;
  learnKey: LearnKey;
}) {
  const toneMap = {
    amber: "border-amber-500/40 bg-amber-500/5",
    slate: "border-slate-600 bg-slate-800/40",
    violet: "border-violet-500/40 bg-violet-500/5",
    emerald: "border-emerald-500/40 bg-emerald-500/5",
  } as const;

  return (
    <Learnable entryKey={learnKey} {...learn} className={`flex flex-col border ${toneMap[tone]} p-3`}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      <div className="mb-2 text-xs text-slate-300">{subtitle}</div>
      <div className="flex flex-1 flex-col justify-center gap-2">{children}</div>
    </Learnable>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-slate-500">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function TrafficGlyph({ rps }: { rps: number }) {
  const intensity = Math.min(100, Math.log10(Math.max(rps, 1)) * 25);
  return (
    <div className="space-y-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-1.5 rounded-full bg-amber-400 transition-all duration-300"
          style={{ width: `${Math.max(20, intensity - i * 10)}%`, opacity: 0.4 + i * 0.2 }}
        />
      ))}
    </div>
  );
}

function LBGlyph() {
  return (
    <div className="rounded-md border border-slate-500 bg-slate-700/40 px-2 py-1.5 text-center text-[10px] font-medium text-slate-200">
      LB
    </div>
  );
}

function ManifestGlyph({ label, tone = "violet" }: { label: string; tone?: "violet" | "emerald" }) {
  const toneMap = {
    violet: "border-violet-400/50 bg-violet-500/10 text-violet-200",
    emerald: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
  } as const;
  return (
    <div className={`rounded-md border px-2 py-1 text-[10px] font-mono ${toneMap[tone]}`}>
      {label}
    </div>
  );
}

function NodeBox({
  podCount,
  capacity,
  learn,
}: {
  podCount: number;
  capacity: number;
  learn: LearnHandlers;
}) {
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-1.5">
      <div className="mb-1 text-[9px] uppercase tracking-wide text-emerald-300/80">Node</div>
      <div className="grid grid-cols-2 gap-1">
        {Array.from({ length: capacity }, (_, i) => {
          const active = i < podCount;
          if (!active) {
            return <div key={i} className="h-4 w-4 rounded-sm bg-slate-700/50" title="empty slot" />;
          }
          return (
            <Learnable key={i} entryKey="pod" {...learn}>
              <div className="h-4 w-4 rounded-sm bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)] transition-all duration-300" />
            </Learnable>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-100">{value}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const opts: { id: ViewMode; label: string }[] = [
    { id: "static", label: "Static" },
    { id: "canvas", label: "Canvas" },
  ];
  return (
    <div className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
            view === o.id
              ? "bg-emerald-500 text-slate-950"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
