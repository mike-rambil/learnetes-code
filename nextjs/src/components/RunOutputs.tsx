"use client";

import { useState } from "react";
import {
  priceRun,
  projectMonthly,
  defaultMonthlyVars,
  deriveScenario,
  type SimRun,
  type MonthlyVars,
} from "@/lib/runPricing";
import { RegionCompare } from "@/components/RegionCompare";
import { RegionScatter } from "@/components/RegionScatter";

function usd(n: number): string {
  if (n > 0 && n < 1) return `$${n.toFixed(n < 0.01 ? 4 : 3)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function inr(n: number): string {
  return `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function duration(hours: number): string {
  const totalSec = Math.round(hours * 3600);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ---------------------------------------------------------------------------
// Pricing — cost of THIS run, then a tunable monthly extrapolation.
// ---------------------------------------------------------------------------

export function PricingCard({ run }: { run: SimRun }) {
  const cost = priceRun(run);
  const [vars, setVars] = useState<MonthlyVars>(() => defaultMonthlyVars(run));
  const monthly = projectMonthly(run, vars);
  const set = (patch: Partial<MonthlyVars>) => setVars((v) => ({ ...v, ...patch }));

  const maxIdle = run.hpa ? run.hpa.max : Math.max(10, Math.round(run.avgReplicas * 2));

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-slate-900/50 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
          Pricing for this run
        </h3>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          {run.region} · {run.pattern}
        </span>
      </div>

      {/* Headline: what this run actually cost */}
      <div className="mb-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-5 py-3">
          <div className="text-[10px] uppercase tracking-wide text-emerald-300/80">
            This run cost
          </div>
          <div className="text-3xl font-bold tabular-nums text-emerald-200">
            {usd(cost.totalUSD)}
          </div>
          <div className="text-[11px] text-slate-400">
            {inr(cost.totalINR)} · over {duration(cost.durationHours)} of simulated time
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <CostBit label="Compute" value={usd(cost.computeUSD)} hint={`${cost.vcpuHours.toFixed(2)} vCPU·h`} />
          <CostBit label="Egress" value={usd(cost.egressUSD)} hint={`${cost.egressGB.toFixed(2)} GB`} />
          <CostBit label="Load balancer" value={usd(cost.lbUSD)} />
          <CostBit label="Control plane" value={usd(cost.controlPlaneUSD)} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
        <span>
          <span className="text-slate-200">{compact(cost.requests)}</span> requests served
        </span>
        <span>
          <span className="text-slate-200">{inr(cost.perThousandRequestsINR)}</span> / 1k requests
        </span>
        <span>
          <span className="text-slate-200">{cost.carbon.kgCO2.toFixed(3)} kg</span> CO₂ (
          {cost.carbon.carKm.toFixed(2)} km driven)
        </span>
      </div>

      {/* Monthly projection — explicitly a guess with knobs */}
      <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-4">
        <div className="mb-1 text-sm font-semibold text-slate-200">Monthly estimate</div>
        <p className="mb-3 text-xs leading-relaxed text-amber-200/90">
          A month is <span className="font-semibold">not</span> this run × 730 hours. Day 1, Day 2,
          Day 3 each carry different runs — different traffic, different scaling. There is no single
          true number, so treat the variables below as <em>your</em> assumptions and watch the
          estimate move.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Slider
            label="Active hours / day"
            min={0}
            max={24}
            step={1}
            value={vars.activeHoursPerDay}
            onChange={(activeHoursPerDay) => set({ activeHoursPerDay })}
            suffix="h"
          />
          <Slider
            label="Days / month"
            min={1}
            max={31}
            step={1}
            value={vars.daysPerMonth}
            onChange={(daysPerMonth) => set({ daysPerMonth })}
            suffix="d"
          />
          <Slider
            label="Idle replicas"
            min={0}
            max={maxIdle}
            step={1}
            value={vars.idleReplicas}
            onChange={(idleReplicas) => set({ idleReplicas })}
            suffix=" pods"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="rounded-lg border border-slate-600 bg-slate-900 px-5 py-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              Estimated month
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-100">
              {usd(monthly.totalUSD)}
            </div>
            <div className="text-[11px] text-slate-400">
              {inr(monthly.totalINR)} · {Math.round(monthly.activeHours)}h active /{" "}
              {Math.round(monthly.idleHours)}h idle
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <CostBit label="Compute" value={usd(monthly.computeUSD)} />
            <CostBit label="Egress" value={usd(monthly.egressUSD)} />
            <CostBit label="Load balancer" value={usd(monthly.lbUSD)} />
            <CostBit label="Control plane" value={usd(monthly.controlPlaneUSD)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CostBit({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums text-slate-100">{value}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums text-emerald-300">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Analytics — what happened during the run, plus region context.
// ---------------------------------------------------------------------------

export function AnalyticsCard({ run }: { run: SimRun }) {
  const cost = priceRun(run);
  const scenario = deriveScenario(run);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/30 bg-slate-900/50 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-300">
            Run analytics
          </h3>
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            {duration(cost.durationHours)} · {run.pattern}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Requests served" value={compact(run.totalRequests)} />
          <Stat label="Avg RPS" value={Math.round(run.avgRps).toLocaleString()} />
          <Stat label="Peak RPS" value={Math.round(run.peakRps).toLocaleString()} />
          <Stat label="Avg replicas" value={run.avgReplicas.toFixed(1)} />
          <Stat label="Peak replicas" value={`${run.peakReplicas}`} />
          <Stat label="Peak nodes" value={`${run.peakNodes}`} />
          <Stat label="Scale events" value={`${run.scaleEvents}`} hint="up/down changes" />
          <Stat
            label="Energy"
            value={`${cost.carbon.totalKWh.toFixed(3)} kWh`}
            hint={`${cost.carbon.gridIntensity} g/kWh grid`}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
        <div className="mb-1 text-sm font-semibold text-slate-200">
          Region context — run average
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Where this run&apos;s average load ({scenario.requestsPerSecond.toLocaleString()} RPS,{" "}
          {scenario.replicas} replicas) would sit on cost and carbon across AWS regions.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <RegionScatter scenario={scenario} />
          <RegionCompare scenario={scenario} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-semibold tabular-nums text-slate-100">{value}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}
