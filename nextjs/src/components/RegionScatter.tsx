"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
} from "recharts";
import { simulate } from "@/lib/calculate";
import { AWS_REGIONS } from "@/lib/pricing";
import type { Scenario } from "@/lib/types";

interface Props {
  scenario: Scenario;
}

export function RegionScatter({ scenario }: Props) {
  const data = useMemo(() => {
    return AWS_REGIONS.map((r) => {
      const result = simulate({ ...scenario, region: r.id });
      return {
        region: r.id,
        label: r.label,
        cost: Math.round(result.cost.totalINR),
        co2: parseFloat(result.carbon.kgCO2.toFixed(2)),
        gridIntensity: r.gridIntensity,
      };
    });
  }, [scenario]);

  const minCost = Math.min(...data.map((d) => d.cost));
  const minCO2 = Math.min(...data.map((d) => d.co2));

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Cost vs Carbon — region trade-off
        </h3>
        <div className="text-xs text-slate-500">
          bottom-left = cheap &amp; green · top-right = expensive &amp; dirty
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 50 }}>
            <CartesianGrid stroke="#1e293b" />
            <XAxis
              type="number"
              dataKey="cost"
              name="Monthly cost (₹)"
              label={{
                value: "Monthly cost (₹)",
                position: "insideBottom",
                offset: -10,
                fill: "#94a3b8",
                fontSize: 11,
              }}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              type="number"
              dataKey="co2"
              name="CO₂ (kg/mo)"
              label={{
                value: "kg CO₂ / month",
                angle: -90,
                position: "insideLeft",
                offset: 0,
                fill: "#94a3b8",
                fontSize: 11,
              }}
              tick={{ fill: "#94a3b8", fontSize: 10 }}
            />
            <ZAxis range={[80, 80]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "#475569" }}
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#e2e8f0" }}
              formatter={(value, name) => {
                const v = typeof value === "number" ? value : Number(value);
                if (name === "cost") return [`₹${v.toLocaleString()}`, "Monthly cost"];
                if (name === "co2") return [`${v} kg`, "Monthly CO₂"];
                return [String(value), String(name)];
              }}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload;
                return p ? p.label : "";
              }}
            />
            <Scatter data={data}>
              {data.map((entry) => {
                const isCheapest = entry.cost === minCost;
                const isGreenest = entry.co2 === minCO2;
                const isCurrent = entry.region === scenario.region;
                let fill = "#64748b";
                if (isCurrent) fill = "#38bdf8";
                else if (isCheapest && isGreenest) fill = "#a855f7";
                else if (isCheapest) fill = "#fbbf24";
                else if (isGreenest) fill = "#34d399";
                return <Cell key={entry.region} fill={fill} />;
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    { color: "#38bdf8", label: "Current region" },
    { color: "#fbbf24", label: "Cheapest" },
    { color: "#34d399", label: "Greenest" },
    { color: "#a855f7", label: "Both" },
    { color: "#64748b", label: "Other" },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: i.color }}
          />
          {i.label}
        </div>
      ))}
    </div>
  );
}
