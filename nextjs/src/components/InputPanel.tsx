"use client";

import { AWS_REGIONS } from "@/lib/pricing";
import type { Scenario } from "@/lib/types";

interface Props {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
}

export function InputPanel({ scenario, onChange }: Props) {
  const update = <K extends keyof Scenario>(key: K, value: Scenario[K]) =>
    onChange({ ...scenario, [key]: value });

  const updatePod = <K extends keyof Scenario["pod"]>(key: K, value: Scenario["pod"][K]) =>
    onChange({ ...scenario, pod: { ...scenario.pod, [key]: value } });

  return (
    <div className="space-y-6 rounded-xl border border-slate-700 bg-slate-900/50 p-6">
      <h2 className="text-lg font-semibold text-slate-100">Workload Configuration</h2>

      <div className="grid gap-4">
        <Field label="Region">
          <select
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
            value={scenario.region}
            onChange={(e) => update("region", e.target.value)}
          >
            {AWS_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} — {r.gridIntensity} gCO₂/kWh
              </option>
            ))}
          </select>
        </Field>

        <Slider
          label="Requests / second"
          value={scenario.requestsPerSecond}
          min={1}
          max={10000}
          step={1}
          onChange={(v) => update("requestsPerSecond", v)}
          format={(v) => `${v.toLocaleString()} RPS`}
        />

        <div className="grid grid-cols-2 gap-3">
          <Slider
            label="Request size"
            value={scenario.avgRequestKB}
            min={0.5}
            max={500}
            step={0.5}
            onChange={(v) => update("avgRequestKB", v)}
            format={(v) => `${v} KB`}
          />
          <Slider
            label="Response size"
            value={scenario.avgResponseKB}
            min={0.5}
            max={2000}
            step={0.5}
            onChange={(v) => update("avgResponseKB", v)}
            format={(v) => `${v} KB`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Slider
            label="vCPU per pod"
            value={scenario.pod.cpu}
            min={0.25}
            max={16}
            step={0.25}
            onChange={(v) => updatePod("cpu", v)}
            format={(v) => `${v} vCPU`}
          />
          <Slider
            label="RAM per pod"
            value={scenario.pod.ramGB}
            min={0.5}
            max={64}
            step={0.5}
            onChange={(v) => updatePod("ramGB", v)}
            format={(v) => `${v} GB`}
          />
        </div>

        <Slider
          label="Replicas"
          value={scenario.replicas}
          min={1}
          max={200}
          step={1}
          onChange={(v) => update("replicas", v)}
          format={(v) => `${v} pods`}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}

function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className="text-sm font-semibold text-emerald-300">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-emerald-500"
      />
    </label>
  );
}
