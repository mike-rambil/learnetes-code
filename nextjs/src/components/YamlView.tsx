"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseManifests } from "@/lib/yamlParser";
import { TrafficSimulator, type RunOutputKind } from "@/components/TrafficSimulator";
import { PricingCard, AnalyticsCard } from "@/components/RunOutputs";
import type { SimRun } from "@/lib/runPricing";

const SAMPLE_YAML = `# Paste your Kubernetes manifests below.
# Supported: Deployment, StatefulSet, HorizontalPodAutoscaler, WorkloadProfile (custom).

apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: app
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    name: api
  minReplicas: 3
  maxReplicas: 20
---
# Custom resource to describe expected traffic — defines what the simulator runs on.
apiVersion: learnetes.io/v1
kind: WorkloadProfile
metadata:
  name: api-traffic
spec:
  requestsPerSecond: 250
  avgRequestKB: 2
  avgResponseKB: 50
  region: ap-south-1
`;

export function YamlView() {
  const [text, setText] = useState(SAMPLE_YAML);

  const parsed = useMemo(() => parseManifests(text), [text]);

  const topologyData = useMemo(() => {
    if (!parsed.ok) return null;
    const primaryName = parsed.summary.deployments[0]?.name;
    const matchingHPA = parsed.summary.hpa.find((h) => h.targetRef === primaryName);
    return {
      hpaPresent: !!matchingHPA,
      hpaMin: matchingHPA?.minReplicas,
      hpaMax: matchingHPA?.maxReplicas,
    };
  }, [parsed]);

  // Outputs are generated on demand from a captured run, not shown by default.
  const [run, setRun] = useState<SimRun | null>(null);
  const [revealed, setRevealed] = useState<Record<RunOutputKind, boolean>>({
    pricing: false,
    analytics: false,
  });
  // Bumped on every reveal — drives both the slide-up replay (via key) and the
  // smooth scroll to the outputs section.
  const [revealSeq, setRevealSeq] = useState(0);
  const outputsRef = useRef<HTMLDivElement>(null);

  const handleReveal = (kind: RunOutputKind, captured: SimRun) => {
    setRun(captured);
    setRevealed((r) => ({ ...r, [kind]: true }));
    setRevealSeq((n) => n + 1);
  };

  useEffect(() => {
    if (revealSeq > 0) {
      outputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [revealSeq]);

  const anyRevealed = run !== null && (revealed.pricing || revealed.analytics);

  return (
    <div className="space-y-6">
      {/* Row 1 — playable canvas (80%) + YAML editor (20%) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[4fr_1fr]">
        <div className="reveal min-w-0">
          {parsed.ok && topologyData ? (
            <TrafficSimulator
              scenario={parsed.scenario}
              hpaPresent={topologyData.hpaPresent}
              hpaMin={topologyData.hpaMin}
              hpaMax={topologyData.hpaMax}
              onReveal={handleReveal}
            />
          ) : (
            <div className="flex h-[480px] items-center justify-center rounded-xl border border-red-500/40 bg-red-500/5 text-sm text-red-200">
              Fix the manifest to render the cluster.
            </div>
          )}
        </div>

        <div className="reveal flex flex-col gap-4" style={{ animationDelay: "70ms" }}>
          <div className="flex flex-1 flex-col rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Manifests</h2>
              <span className="text-[10px] text-slate-500">YAML · multi-doc</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="min-h-[400px] flex-1 resize-none rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-emerald-500"
            />
          </div>
          {!parsed.ok && <ParseErrorBox error={parsed.error} />}
          {parsed.ok && parsed.summary.warnings.length > 0 && (
            <WarningsBox warnings={parsed.summary.warnings} />
          )}
        </div>
      </div>

      {/* Row 2 — outputs, generated only once a run is captured & a button clicked */}
      {parsed.ok ? (
        <div ref={outputsRef} className="scroll-mt-6">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold uppercase tracking-wide">Simulation output</span>
            <span className="text-slate-600">— pricing &amp; analytics for your captured run</span>
          </div>
          {anyRevealed ? (
            <div className="space-y-4">
              {revealed.pricing && run && (
                <div key={`pricing-${revealSeq}`} className="card-rise">
                  <PricingCard run={run} />
                </div>
              )}
              {revealed.analytics && run && (
                <div
                  key={`analytics-${revealSeq}`}
                  className="card-rise"
                  style={{ animationDelay: "90ms" }}
                >
                  <AnalyticsCard run={run} />
                </div>
              )}
              {run && revealed.pricing !== revealed.analytics && (
                <CrossSellCTA
                  missing={revealed.pricing ? "analytics" : "pricing"}
                  onReveal={() =>
                    handleReveal(revealed.pricing ? "analytics" : "pricing", run)
                  }
                />
              )}
            </div>
          ) : (
            <OutputPlaceholder />
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-6 text-sm text-slate-400">
          Fix the parse error to see simulation output.
        </div>
      )}
    </div>
  );
}

function CrossSellCTA({
  missing,
  onReveal,
}: {
  missing: RunOutputKind;
  onReveal: () => void;
}) {
  const copy =
    missing === "pricing"
      ? { label: "Get pricing", blurb: "what this run would cost — per run and extrapolated monthly" }
      : { label: "Get analytics", blurb: "what happened during the run, plus region context" };
  return (
    <div className="card-rise flex flex-col items-center gap-3 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 px-6 py-6 text-center sm:flex-row sm:justify-between sm:text-left">
      <div>
        <div className="text-sm font-medium text-slate-200">
          You haven&apos;t tried <span className="text-emerald-300">{missing}</span> yet
        </div>
        <p className="mt-0.5 text-xs text-slate-400">Same captured run — see {copy.blurb}.</p>
      </div>
      <button
        onClick={onReveal}
        className="shrink-0 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20"
      >
        {copy.label}
      </button>
    </div>
  );
}

function OutputPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-slate-500">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <div className="text-sm font-medium text-slate-300">No run captured yet</div>
      <p className="max-w-md text-xs text-slate-500">
        Press <span className="text-emerald-300">Play</span> to drive traffic through the cluster,
        then <span className="text-amber-300">Pause</span> and choose{" "}
        <span className="text-slate-300">Get pricing</span> or{" "}
        <span className="text-slate-300">Get analytics</span> to generate results for that specific
        run.
      </p>
    </div>
  );
}

function WarningsBox({ warnings }: { warnings: string[] }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        Manifest warnings
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-200">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function ParseErrorBox({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-5 text-sm text-red-200">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-300">
        Parse error
      </div>
      <div className="whitespace-pre-wrap font-mono">{error}</div>
    </div>
  );
}
