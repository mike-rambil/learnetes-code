"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { InputPanel } from "@/components/InputPanel";
import { Dashboard } from "@/components/Dashboard";
import { RegionCompare } from "@/components/RegionCompare";
import { YamlView } from "@/components/YamlView";
import { ArchitectureView } from "@/components/ArchitectureView";
import { RegionScatter } from "@/components/RegionScatter";
import { simulate } from "@/lib/calculate";
import { computeTopology } from "@/lib/topology";
import { LogoMark } from "@/components/Logo";
import type { Scenario } from "@/lib/types";

const DEFAULT_SCENARIO: Scenario = {
  provider: "aws",
  region: "ap-south-1",
  requestsPerSecond: 100,
  avgRequestKB: 2,
  avgResponseKB: 50,
  pod: { cpu: 1, ramGB: 2 },
  replicas: 3,
  hoursPerMonth: 730,
};

type ViewMode = "yaml" | "admin";

export default function Sandbox() {
  const [mode, setMode] = useState<ViewMode>("yaml");
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const adminResult = useMemo(() => simulate(scenario), [scenario]);
  const adminTopology = useMemo(() => computeTopology({ scenario }), [scenario]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="w-full px-4 py-4 sm:px-6 lg:px-10">
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-7 w-7 shrink-0" />
            <div>
              <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                <span className="text-emerald-400">Learn</span>etes
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Live Kubernetes topology simulator with real-time cost &amp; carbon — driven by your manifests.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden text-xs text-slate-500 transition hover:text-emerald-400 sm:inline"
            >
              ← Home
            </Link>
            <ViewToggle mode={mode} onChange={setMode} />
          </div>
        </header>

        {mode === "yaml" ? (
          <YamlView />
        ) : (
          <div className="space-y-6">
            <ArchitectureView
              scenario={scenario}
              topology={adminTopology}
              hpaPresent={false}
            />
            <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
              <InputPanel scenario={scenario} onChange={setScenario} />
              <div className="space-y-6">
                <Dashboard result={adminResult} />
                <RegionScatter scenario={scenario} />
                <RegionCompare scenario={scenario} />
              </div>
            </div>
          </div>
        )}

        <footer className="mt-12 space-y-1 text-center text-xs text-slate-600">
          <div>
            Learnetes · Live AWS Kubernetes topology simulator with real-time cost &amp; carbon · prototype build
          </div>
          <div className="text-slate-700">
            Pricing snapshot: AWS public pricing pages (cited 2026-05). FX rate: ₹83.5/USD.
            Carbon coefficients: Cloud Carbon Footprint (Thoughtworks) + Electricity Maps grid data.
            Methodology: Green Software Foundation SCI spec.
          </div>
        </footer>
      </div>
    </main>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex rounded-lg border border-slate-700 bg-slate-900/60 p-1 text-sm">
      <button
        onClick={() => onChange("yaml")}
        className={`rounded-md px-3 py-1.5 transition ${
          mode === "yaml"
            ? "bg-emerald-500/20 text-emerald-200"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        YAML view
      </button>
      <button
        onClick={() => onChange("admin")}
        className={`rounded-md px-3 py-1.5 transition ${
          mode === "admin"
            ? "bg-emerald-500/20 text-emerald-200"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        Admin view
      </button>
    </div>
  );
}
