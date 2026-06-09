"use client";

import { useMemo } from "react";
import { simulate } from "@/lib/calculate";
import { AWS_REGIONS } from "@/lib/pricing";
import type { Scenario } from "@/lib/types";

interface Props {
  scenario: Scenario;
}

export function RegionCompare({ scenario }: Props) {
  const rows = useMemo(() => {
    return AWS_REGIONS.map((r) => {
      const result = simulate({ ...scenario, region: r.id });
      return { region: r, result };
    });
  }, [scenario]);

  const cheapest = Math.min(...rows.map((x) => x.result.cost.totalINR));
  const greenest = Math.min(...rows.map((x) => x.result.carbon.kgCO2));

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-300">
        Region comparator — same workload, every region
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2">Region</th>
              <th className="pb-2 text-right">Cost (₹/mo)</th>
              <th className="pb-2 text-right">CO₂ (kg/mo)</th>
              <th className="pb-2 text-right">Grid (gCO₂/kWh)</th>
              <th className="pb-2 text-right">Tags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ region, result }) => {
              const isCheapest = result.cost.totalINR === cheapest;
              const isGreenest = result.carbon.kgCO2 === greenest;
              const isCurrent = region.id === scenario.region;
              return (
                <tr
                  key={region.id}
                  className={`border-t border-slate-800 ${isCurrent ? "bg-slate-800/40" : ""}`}
                >
                  <td className="py-2">
                    <div className="text-slate-200">{region.label}</div>
                    <div className="text-xs text-slate-500">{region.country}</div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-200">
                    ₹{Math.round(result.cost.totalINR).toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-200">
                    {result.carbon.kgCO2.toFixed(1)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-400">
                    {region.gridIntensity}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {isCurrent && (
                        <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-200">
                          current
                        </span>
                      )}
                      {isCheapest && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                          cheapest
                        </span>
                      )}
                      {isGreenest && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] uppercase text-emerald-300">
                          greenest
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
