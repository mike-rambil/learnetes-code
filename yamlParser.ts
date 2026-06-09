import yaml from "js-yaml";
import type { Scenario } from "./types";

export interface ParseError {
  ok: false;
  error: string;
}

export interface ParsedManifest {
  ok: true;
  scenario: Scenario;
  summary: {
    deployments: { name: string; replicas: number; containers: { name: string; cpu: number; ramGB: number }[] }[];
    hpa: { name: string; targetRef: string; minReplicas: number; maxReplicas: number }[];
    workloadProfile?: { name: string; requestsPerSecond: number; avgRequestKB: number; avgResponseKB: number; region?: string };
    warnings: string[];
  };
}

export type ParseResult = ParsedManifest | ParseError;

interface K8sDoc {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string };
  spec?: Record<string, unknown>;
}

const DEFAULT_REGION = "ap-south-1";
const DEFAULT_HOURS_PER_MONTH = 730;

export function parseManifests(input: string): ParseResult {
  if (!input.trim()) {
    return { ok: false, error: "Paste one or more Kubernetes manifests to begin." };
  }

  let docs: unknown[];
  try {
    docs = yaml.loadAll(input).filter((d) => d != null);
  } catch (e) {
    return { ok: false, error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (docs.length === 0) {
    return { ok: false, error: "No documents found in YAML." };
  }

  const warnings: string[] = [];
  const deployments: ParsedManifest["summary"]["deployments"] = [];
  const hpas: ParsedManifest["summary"]["hpa"] = [];
  let workloadProfile: ParsedManifest["summary"]["workloadProfile"];

  for (const raw of docs) {
    const doc = raw as K8sDoc;
    const kind = doc.kind;
    if (!kind) continue;

    if (kind === "Deployment" || kind === "StatefulSet" || kind === "ReplicaSet") {
      const parsed = parseWorkload(doc);
      if (parsed) deployments.push(parsed);
    } else if (kind === "HorizontalPodAutoscaler") {
      const parsed = parseHPA(doc);
      if (parsed) hpas.push(parsed);
    } else if (kind === "WorkloadProfile") {
      const parsed = parseWorkloadProfile(doc);
      if (parsed) workloadProfile = parsed;
    } else if (["Service", "Ingress", "ConfigMap", "Secret", "Namespace"].includes(kind)) {
      continue;
    } else {
      warnings.push(`Unsupported kind ignored: ${kind}`);
    }
  }

  if (deployments.length === 0) {
    return {
      ok: false,
      error: "No Deployment / StatefulSet / ReplicaSet found. At least one workload resource is required.",
    };
  }

  const primary = deployments[0];
  if (deployments.length > 1) {
    warnings.push(`Multiple workloads found — using first (${primary.name}) for simulation.`);
  }

  const matchingHPA = hpas.find((h) => h.targetRef === primary.name);
  let effectiveReplicas = primary.replicas;
  if (matchingHPA) {
    effectiveReplicas = matchingHPA.minReplicas;
    warnings.push(
      `HPA detected for ${primary.name}: min=${matchingHPA.minReplicas}, max=${matchingHPA.maxReplicas}. Simulating at minReplicas.`,
    );
  }

  const totalCPU = primary.containers.reduce((sum, c) => sum + c.cpu, 0);
  const totalRAM = primary.containers.reduce((sum, c) => sum + c.ramGB, 0);

  if (totalCPU === 0) warnings.push("No CPU requests found in containers — defaulting to 0.5 vCPU.");
  if (totalRAM === 0) warnings.push("No memory requests found in containers — defaulting to 1 GB.");

  const traffic = workloadProfile ?? {
    name: "default",
    requestsPerSecond: 100,
    avgRequestKB: 2,
    avgResponseKB: 50,
  };

  if (!workloadProfile) {
    warnings.push("No WorkloadProfile found — using default traffic (100 RPS, 2KB req, 50KB res). Add a WorkloadProfile resource to override.");
  }

  const scenario: Scenario = {
    provider: "aws",
    region: workloadProfile?.region ?? DEFAULT_REGION,
    requestsPerSecond: traffic.requestsPerSecond,
    avgRequestKB: traffic.avgRequestKB,
    avgResponseKB: traffic.avgResponseKB,
    pod: {
      cpu: totalCPU || 0.5,
      ramGB: totalRAM || 1,
    },
    replicas: effectiveReplicas,
    hoursPerMonth: DEFAULT_HOURS_PER_MONTH,
  };

  return {
    ok: true,
    scenario,
    summary: { deployments, hpa: hpas, workloadProfile, warnings },
  };
}

function parseWorkload(doc: K8sDoc): ParsedManifest["summary"]["deployments"][number] | null {
  const name = doc.metadata?.name ?? "unnamed";
  const spec = (doc.spec ?? {}) as { replicas?: number; template?: { spec?: { containers?: unknown[] } } };
  const replicas = typeof spec.replicas === "number" ? spec.replicas : 1;
  const containers = (spec.template?.spec?.containers ?? []) as Array<{
    name?: string;
    resources?: { requests?: { cpu?: string; memory?: string }; limits?: { cpu?: string; memory?: string } };
  }>;

  const parsedContainers = containers.map((c) => {
    const req = c.resources?.requests ?? {};
    const lim = c.resources?.limits ?? {};
    const cpuStr = req.cpu ?? lim.cpu;
    const memStr = req.memory ?? lim.memory;
    return {
      name: c.name ?? "unnamed",
      cpu: cpuStr ? parseCPU(cpuStr) : 0,
      ramGB: memStr ? parseMemory(memStr) : 0,
    };
  });

  return { name, replicas, containers: parsedContainers };
}

function parseHPA(doc: K8sDoc): ParsedManifest["summary"]["hpa"][number] | null {
  const name = doc.metadata?.name ?? "unnamed";
  const spec = (doc.spec ?? {}) as {
    scaleTargetRef?: { name?: string };
    minReplicas?: number;
    maxReplicas?: number;
  };
  return {
    name,
    targetRef: spec.scaleTargetRef?.name ?? "",
    minReplicas: spec.minReplicas ?? 1,
    maxReplicas: spec.maxReplicas ?? 1,
  };
}

function parseWorkloadProfile(doc: K8sDoc): ParsedManifest["summary"]["workloadProfile"] | null {
  const name = doc.metadata?.name ?? "default";
  const spec = (doc.spec ?? {}) as {
    requestsPerSecond?: number;
    avgRequestKB?: number;
    avgResponseKB?: number;
    region?: string;
  };
  return {
    name,
    requestsPerSecond: spec.requestsPerSecond ?? 100,
    avgRequestKB: spec.avgRequestKB ?? 2,
    avgResponseKB: spec.avgResponseKB ?? 50,
    region: spec.region,
  };
}

export function parseCPU(value: string | number): number {
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  if (trimmed.endsWith("m")) {
    return parseFloat(trimmed.slice(0, -1)) / 1000;
  }
  return parseFloat(trimmed);
}

export function parseMemory(value: string | number): number {
  if (typeof value === "number") return value / (1024 ** 3);
  const trimmed = value.trim();
  const match = trimmed.match(/^([\d.]+)\s*([KMGT]i?)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2] ?? "";
  switch (unit) {
    case "Ki": return num / (1024 * 1024);
    case "Mi": return num / 1024;
    case "Gi": return num;
    case "Ti": return num * 1024;
    case "K": return num / 1_000_000;
    case "M": return num / 1000;
    case "G": return num;
    case "T": return num * 1000;
    default: return num / (1024 ** 3);
  }
}
