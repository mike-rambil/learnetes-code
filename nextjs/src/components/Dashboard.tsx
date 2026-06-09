"use client";

import type { SimulationResult } from "@/lib/types";
import { AnimatedNumber } from "@/components/AnimatedNumber";

interface Props {
  result: SimulationResult;
}

export function Dashboard({ result }: Props) {
  const { cost, carbon, requestsPerMonth, egressGB } = result;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <BigStat
          label="Monthly cost"
          value={cost.totalINR}
          format={(n) => `₹${formatNum(n)}`}
          sub={`$${formatNum(cost.totalUSD)} USD`}
          tone="cost"
        />
        <BigStat
          label="Cost / 1k req"
          value={cost.perThousandRequestsINR}
          format={(n) => `₹${n.toFixed(4)}`}
          sub={`${formatNum(requestsPerMonth)} req/mo`}
          tone="cost"
        />
        <BigStat
          label="Monthly CO₂"
          value={carbon.kgCO2}
          format={(n) => `${formatNum(n)} kg`}
          sub={`${carbon.gridIntensity} gCO₂/kWh grid`}
          tone="carbon"
        />
        <BigStat
          label="Car-km equivalent"
          value={carbon.carKmEquivalent}
          format={(n) => `${formatNum(n)} km`}
          sub={`${carbon.gCO2PerThousandRequests.toFixed(2)} g/1k req`}
          tone="carbon"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Cost breakdown (USD/month)" tone="cost">
          <Row label="Compute (pods)" value={cost.computeUSD} />
          <Row label="Egress" value={cost.egressUSD} sub={`${formatNum(egressGB)} GB out`} />
          <Row label="Load balancer (ALB)" value={cost.loadBalancerUSD} />
          <Row label="EKS control plane" value={cost.controlPlaneUSD} />
          <div className="my-2 h-px bg-slate-700" />
          <Row label="Total" value={cost.totalUSD} bold />
        </Panel>

        <Panel title="Carbon breakdown (kWh & kg CO₂)" tone="carbon">
          <Row label="Compute energy" value={carbon.computeKWh} unit="kWh" />
          <Row label="Network energy" value={carbon.networkKWh} unit="kWh" />
          <div className="my-2 h-px bg-slate-700" />
          <Row label="Total energy" value={carbon.totalKWh} unit="kWh" bold />
          <Row label="Total CO₂" value={carbon.kgCO2} unit="kg" bold />
        </Panel>
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function BigStat({
  label,
  value,
  format,
  sub,
  tone,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  sub: string;
  tone: "cost" | "carbon";
}) {
  const accent = tone === "cost" ? "text-amber-300" : "text-emerald-300";
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <AnimatedNumber value={value} format={format} className={`mt-1 block text-2xl font-bold tabular-nums ${accent}`} />
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function Panel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "cost" | "carbon";
  children: React.ReactNode;
}) {
  const accent = tone === "cost" ? "border-amber-500/30" : "border-emerald-500/30";
  return (
    <div className={`rounded-xl border ${accent} bg-slate-900/50 p-5`}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  unit = "",
  sub,
  bold,
}: {
  label: string;
  value: number;
  unit?: string;
  sub?: string;
  bold?: boolean;
}) {
  const fmt = (n: number) => (unit ? `${formatNum(n)} ${unit}` : `$${formatNum(n)}`);
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className={`${bold ? "font-semibold text-slate-100" : "text-slate-400"}`}>
        {label}
        {sub && <span className="ml-2 text-xs text-slate-500">({sub})</span>}
      </span>
      <AnimatedNumber
        value={value}
        format={fmt}
        className={`tabular-nums ${bold ? "font-bold text-slate-100" : "text-slate-300"}`}
      />
    </div>
  );
}
