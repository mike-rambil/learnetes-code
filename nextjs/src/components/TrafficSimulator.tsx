"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeTopology,
  DEFAULT_PODS_PER_NODE,
  DEFAULT_RPS_PER_POD,
} from "@/lib/topology";
import {
  buildLiveTopology,
  desiredReplicas,
  initScaler,
  trafficAt,
  stepScaler,
  DEFAULT_SCALER,
  type ScalerConfig,
  type ScalerState,
  type TrafficPattern,
} from "@/lib/simulation";
import type { SimRun } from "@/lib/runPricing";
import { ArchitectureView } from "@/components/ArchitectureView";
import type { Scenario } from "@/lib/types";

export type RunOutputKind = "pricing" | "analytics";

interface Props {
  scenario: Scenario;
  hpaPresent: boolean;
  hpaMin?: number;
  hpaMax?: number;
  onReveal?: (kind: RunOutputKind, run: SimRun) => void;
}

interface Accumulator {
  requests: number;
  podSeconds: number;
  sumRps: number;
  ticks: number;
  peakRps: number;
  peakReplicas: number;
  peakNodes: number;
  scaleEvents: number;
  lastReplicas: number;
}

interface SimState {
  tSec: number;
  rps: number;
  scaler: ScalerState;
  history: { t: number; rps: number; replicas: number }[];
  acc: Accumulator;
}

const TICK_MS = 100; // real-time loop cadence
const PERIOD_SEC = 60; // wave/spike cycle and ramp length, in simulated seconds
const HISTORY_MAX = 180;

const PATTERNS: { id: TrafficPattern; label: string }[] = [
  { id: "ramp", label: "Ramp" },
  { id: "wave", label: "Wave" },
  { id: "spike", label: "Spike" },
  { id: "steady", label: "Steady" },
];

// Simulated seconds elapsed per real second.
const SPEEDS: { label: string; value: number }[] = [
  { label: "5×", value: 5 },
  { label: "15×", value: 15 },
  { label: "60×", value: 60 },
];

// Each unit, expressed as a multiplier onto requests-per-second.
const UNITS: { id: string; label: string; perSecond: number }[] = [
  { id: "ms", label: "per ms", perSecond: 1000 },
  { id: "s", label: "per second", perSecond: 1 },
  { id: "min", label: "per minute", perSecond: 1 / 60 },
];

function emptyAcc(replicas: number): Accumulator {
  return {
    requests: 0,
    podSeconds: 0,
    sumRps: 0,
    ticks: 0,
    peakRps: 0,
    peakReplicas: replicas,
    peakNodes: Math.max(1, Math.ceil(replicas / DEFAULT_PODS_PER_NODE)),
    scaleEvents: 0,
    lastReplicas: replicas,
  };
}

export function TrafficSimulator({ scenario, hpaPresent, hpaMin, hpaMax, onReveal }: Props) {
  const [loadValue, setLoadValue] = useState<number>(() =>
    Math.max(1, Math.round(scenario.requestsPerSecond)),
  );
  const [unitId, setUnitId] = useState("s");
  const [pattern, setPattern] = useState<TrafficPattern>("ramp");
  const [speed, setSpeed] = useState(15);
  const [running, setRunning] = useState(false);

  const unit = UNITS.find((u) => u.id === unitId) ?? UNITS[1];
  const peakRps = Math.max(1, Math.round(loadValue * unit.perSecond));

  const hpaCfg: ScalerConfig | null = useMemo(
    () =>
      hpaPresent && hpaMin != null && hpaMax != null
        ? { min: hpaMin, max: hpaMax, rpsPerPod: DEFAULT_RPS_PER_POD, ...DEFAULT_SCALER }
        : null,
    [hpaPresent, hpaMin, hpaMax],
  );

  const startReplicas = hpaCfg ? hpaCfg.min : scenario.replicas;

  const [sim, setSim] = useState<SimState>(() => ({
    tSec: 0,
    rps: 0,
    scaler: initScaler(startReplicas),
    history: [],
    acc: emptyAcc(startReplicas),
  }));

  // Reset the run whenever the cluster's structural inputs change (the user
  // edits the manifest's HPA bounds or base replicas) so the sim never runs with
  // stale scaling limits. Adjusting state during render is React's documented
  // alternative to a reset effect.
  const baseKey = `${hpaPresent}|${hpaMin}|${hpaMax}|${scenario.replicas}`;
  const [prevBaseKey, setPrevBaseKey] = useState(baseKey);
  if (baseKey !== prevBaseKey) {
    setPrevBaseKey(baseKey);
    setRunning(false);
    setSim({
      tSec: 0,
      rps: 0,
      scaler: initScaler(startReplicas),
      history: [],
      acc: emptyAcc(startReplicas),
    });
  }

  // The loop reads live config through a ref so we never tear down / rebuild the
  // interval when the user tweaks load, pattern, or speed mid-run.
  const cfgRef = useRef({
    pattern,
    peakRps,
    hpaCfg,
    fixedReplicas: scenario.replicas,
    dtSim: speed * (TICK_MS / 1000),
  });
  useEffect(() => {
    cfgRef.current = {
      pattern,
      peakRps,
      hpaCfg,
      fixedReplicas: scenario.replicas,
      dtSim: speed * (TICK_MS / 1000),
    };
  });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const { pattern, peakRps, hpaCfg, fixedReplicas, dtSim } = cfgRef.current;
      setSim((prev) => {
        const tSec = prev.tSec + dtSim;
        const rps = trafficAt({ pattern, peakRps, periodSec: PERIOD_SEC }, tSec);
        const scaler = hpaCfg ? stepScaler(prev.scaler, rps, hpaCfg, tSec) : prev.scaler;
        const replicas = hpaCfg ? scaler.replicas : fixedReplicas;
        const nodes = Math.max(1, Math.ceil(replicas / DEFAULT_PODS_PER_NODE));

        const a = prev.acc;
        const acc: Accumulator = {
          requests: a.requests + rps * dtSim,
          podSeconds: a.podSeconds + replicas * dtSim,
          sumRps: a.sumRps + rps,
          ticks: a.ticks + 1,
          peakRps: Math.max(a.peakRps, rps),
          peakReplicas: Math.max(a.peakReplicas, replicas),
          peakNodes: Math.max(a.peakNodes, nodes),
          scaleEvents: a.scaleEvents + (replicas !== a.lastReplicas ? 1 : 0),
          lastReplicas: replicas,
        };

        const point = { t: tSec, rps, replicas };
        const history =
          prev.history.length >= HISTORY_MAX
            ? [...prev.history.slice(1), point]
            : [...prev.history, point];
        return { tSec, rps, scaler, history, acc };
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  const reset = () => {
    setRunning(false);
    setSim({
      tSec: 0,
      rps: 0,
      scaler: initScaler(startReplicas),
      history: [],
      acc: emptyAcc(startReplicas),
    });
  };

  const started = running || sim.tSec > 0;
  const displayRps = started ? sim.rps : Math.round(scenario.requestsPerSecond);
  const runningReplicas = hpaCfg ? sim.scaler.replicas : scenario.replicas;
  const wanted = hpaCfg ? desiredReplicas(displayRps, hpaCfg) : scenario.replicas;

  const idleTopology = useMemo(
    () => computeTopology({ scenario, hpa: hpaCfg ?? undefined }),
    [scenario, hpaCfg],
  );

  const topology = started
    ? buildLiveTopology({
        rps: displayRps,
        runningReplicas,
        baseReplicas: scenario.replicas,
        hpa: hpaCfg ?? undefined,
      })
    : idleTopology;

  const liveScenario: Scenario = { ...scenario, requestsPerSecond: Math.round(displayRps) };

  const status = !hpaCfg
    ? { label: "No HPA — fixed", tone: "slate" as const }
    : runningReplicas >= hpaCfg.max
      ? { label: "At max", tone: "red" as const }
      : wanted > runningReplicas
        ? { label: "Scaling up", tone: "emerald" as const }
        : wanted < runningReplicas
          ? { label: "Cooling down", tone: "amber" as const }
          : { label: "Stable", tone: "slate" as const };

  const buildRun = (): SimRun => {
    const a = sim.acc;
    const durationSec = sim.tSec;
    return {
      region: scenario.region,
      pattern,
      durationSec,
      totalRequests: a.requests,
      podSeconds: a.podSeconds,
      avgRps: a.ticks > 0 ? a.sumRps / a.ticks : displayRps,
      peakRps: a.peakRps,
      avgReplicas: durationSec > 0 ? a.podSeconds / durationSec : startReplicas,
      peakReplicas: a.peakReplicas,
      peakNodes: a.peakNodes,
      scaleEvents: a.scaleEvents,
      pod: scenario.pod,
      avgRequestKB: scenario.avgRequestKB,
      avgResponseKB: scenario.avgResponseKB,
      hpa: hpaCfg ? { min: hpaCfg.min, max: hpaCfg.max } : undefined,
    };
  };

  const reveal = (kind: RunOutputKind) => onReveal?.(kind, buildRun());

  // A run is "captured" once it's been played and is currently paused.
  const paused = !running && started;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Traffic &amp; autoscaling simulator
          </h3>
          <div className="flex items-center gap-2 text-[10px] uppercase">
            <StatusPill {...status} />
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">
              {formatClock(sim.tSec)}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Load">
            <div className="flex items-center overflow-hidden rounded-md border border-slate-700 bg-slate-950">
              <input
                type="number"
                min={1}
                value={loadValue}
                onChange={(e) => setLoadValue(Math.max(1, Number(e.target.value) || 0))}
                className="w-24 bg-transparent px-2.5 py-1.5 text-sm text-slate-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="border-l border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-300 outline-none"
              >
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="Pattern">
            <Segmented
              options={PATTERNS.map((p) => ({ id: p.id, label: p.label }))}
              value={pattern}
              onChange={(v) => setPattern(v as TrafficPattern)}
            />
          </Field>

          <Field label="Speed">
            <Segmented
              options={SPEEDS.map((s) => ({ id: String(s.value), label: s.label }))}
              value={String(speed)}
              onChange={(v) => setSpeed(Number(v))}
            />
          </Field>

          <div className="ml-auto flex items-end gap-2">
            <button
              onClick={() => setRunning((r) => !r)}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
                running
                  ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                  : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              }`}
            >
              {running ? <PauseIcon /> : <PlayIcon />}
              {running ? "Pause" : started ? "Resume" : "Play"}
            </button>
            <button
              onClick={reset}
              disabled={!started}
              className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ResetIcon />
              Reset
            </button>
          </div>
        </div>

        {!hpaCfg && (
          <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            No HorizontalPodAutoscaler in the manifest — replicas stay fixed at{" "}
            {scenario.replicas}. Add an HPA to watch pods scale with traffic.
          </p>
        )}

        {/* Live readout */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="Live RPS" value={displayRps.toLocaleString()} tone="amber" />
          <Metric label="Desired" value={`${wanted}`} hint="pods wanted" tone="violet" />
          <Metric
            label="Running"
            value={`${runningReplicas}`}
            hint={hpaCfg ? `min ${hpaCfg.min} · max ${hpaCfg.max}` : "fixed"}
            tone="emerald"
          />
          <Metric label="Nodes" value={`${topology.nodeCount}`} tone="emerald" />
          <Metric
            label="Capacity"
            value={`${topology.capacityUtilizationPercent.toFixed(0)}%`}
            hint="of running pods"
            tone="slate"
          />
        </div>

        <Sparkline history={sim.history} hpaMax={hpaCfg?.max} />

        {/* Run capture — only offered once a run is paused. */}
        <div
          className={`mt-3 overflow-hidden transition-all duration-500 ${
            paused ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-emerald-300">Run captured</span> ·{" "}
              {formatClock(sim.tSec)} · {formatCompact(sim.acc.requests)} requests · peaked{" "}
              {sim.acc.peakReplicas} pods
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => reveal("pricing")}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                <CoinIcon />
                Get pricing
              </button>
              <button
                onClick={() => reveal("analytics")}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/60 hover:text-emerald-300"
              >
                <ChartIcon />
                Get analytics
              </button>
            </div>
          </div>
        </div>
      </div>

      <ArchitectureView
        scenario={liveScenario}
        topology={topology}
        hpaPresent={hpaPresent}
        hpaMin={hpaMin}
        hpaMax={hpaMax}
        live={running}
      />
    </div>
  );
}

function Sparkline({
  history,
  hpaMax,
}: {
  history: { t: number; rps: number; replicas: number }[];
  hpaMax?: number;
}) {
  if (history.length < 2) {
    return (
      <div className="mt-3 flex h-[60px] items-center justify-center rounded-md border border-dashed border-slate-800 text-[11px] text-slate-600">
        Press play to chart traffic vs. replicas over time
      </div>
    );
  }

  const W = 600;
  const H = 60;
  const n = history.length;
  const maxRps = Math.max(1, ...history.map((p) => p.rps));
  const maxRep = Math.max(1, hpaMax ?? Math.max(...history.map((p) => p.replicas)));
  const x = (i: number) => (i / (n - 1)) * W;
  const line = (sel: (p: (typeof history)[number]) => number, max: number) =>
    history.map((p, i) => `${x(i).toFixed(1)},${(H - (sel(p) / max) * H).toFixed(1)}`).join(" ");

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-4 text-[10px] uppercase tracking-wide text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> RPS
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Replicas
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[60px] w-full rounded-md border border-slate-800 bg-slate-950/60"
      >
        <polyline
          points={line((p) => p.rps, maxRps)}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={line((p) => p.replicas, maxRep)}
          fill="none"
          stroke="#34d399"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-slate-700 bg-slate-950 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition ${
            value === o.id
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

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "amber" | "violet" | "emerald" | "slate";
}) {
  const toneMap = {
    amber: "text-amber-300",
    violet: "text-violet-300",
    emerald: "text-emerald-300",
    slate: "text-slate-200",
  } as const;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneMap[tone]}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "emerald" | "amber" | "red" | "slate" }) {
  const toneMap = {
    emerald: "bg-emerald-500/20 text-emerald-300",
    amber: "bg-amber-500/20 text-amber-300",
    red: "bg-red-500/20 text-red-300",
    slate: "bg-slate-700 text-slate-300",
  } as const;
  return <span className={`rounded px-1.5 py-0.5 ${toneMap[tone]}`}>{label}</span>;
}

function formatClock(totalSec: number): string {
  const s = Math.floor(totalSec);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

const ICON = "h-4 w-4";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={ICON}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18M7 14l3-4 3 3 4-6" />
    </svg>
  );
}
