import { describe, it, expect } from "vitest";
import { parseManifests, parseCPU, parseMemory } from "../yamlParser";

describe("parseCPU", () => {
  it("converts milli notation", () => {
    expect(parseCPU("100m")).toBeCloseTo(0.1);
    expect(parseCPU("500m")).toBeCloseTo(0.5);
    expect(parseCPU("1500m")).toBeCloseTo(1.5);
  });

  it("parses whole and decimal cores", () => {
    expect(parseCPU("1")).toBe(1);
    expect(parseCPU("2")).toBe(2);
    expect(parseCPU("0.5")).toBe(0.5);
  });

  it("passes through numbers", () => {
    expect(parseCPU(2.5)).toBe(2.5);
  });
});

describe("parseMemory", () => {
  it("handles binary units", () => {
    expect(parseMemory("1Gi")).toBe(1);
    expect(parseMemory("256Mi")).toBeCloseTo(0.25);
    expect(parseMemory("512Mi")).toBeCloseTo(0.5);
    expect(parseMemory("1024Mi")).toBeCloseTo(1);
  });

  it("handles decimal SI units", () => {
    expect(parseMemory("1G")).toBe(1);
    expect(parseMemory("500M")).toBeCloseTo(0.5);
  });

  it("handles Ki and Ti", () => {
    expect(parseMemory("1048576Ki")).toBeCloseTo(1);
    expect(parseMemory("1Ti")).toBeCloseTo(1024);
  });

  it("returns 0 for unparseable input", () => {
    expect(parseMemory("garbage")).toBe(0);
  });
});

describe("parseManifests", () => {
  it("rejects empty input", () => {
    const r = parseManifests("");
    expect(r.ok).toBe(false);
  });

  it("rejects invalid YAML", () => {
    const r = parseManifests(": :: bad :: :");
    expect(r.ok).toBe(false);
  });

  it("rejects when no workload is present", () => {
    const r = parseManifests(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  key: value
`);
    expect(r.ok).toBe(false);
  });

  it("parses a basic Deployment", () => {
    const r = parseManifests(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 5
  template:
    spec:
      containers:
        - name: app
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario.replicas).toBe(5);
    expect(r.scenario.pod.cpu).toBeCloseTo(0.5);
    expect(r.scenario.pod.ramGB).toBeCloseTo(1);
    expect(r.summary.deployments.length).toBe(1);
  });

  it("falls back to limits if requests are missing", () => {
    const r = parseManifests(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          resources:
            limits:
              cpu: "2"
              memory: "4Gi"
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario.pod.cpu).toBe(2);
    expect(r.scenario.pod.ramGB).toBe(4);
  });

  it("captures HPA and reports min/max in warnings", () => {
    const r = parseManifests(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
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
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.hpa.length).toBe(1);
    expect(r.summary.hpa[0].minReplicas).toBe(3);
    expect(r.summary.hpa[0].maxReplicas).toBe(20);
    expect(r.scenario.replicas).toBe(3);
  });

  it("uses WorkloadProfile to set traffic and region", () => {
    const r = parseManifests(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: app
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
---
apiVersion: learnetes.io/v1
kind: WorkloadProfile
metadata:
  name: traffic
spec:
  requestsPerSecond: 500
  avgRequestKB: 4
  avgResponseKB: 100
  region: eu-north-1
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario.requestsPerSecond).toBe(500);
    expect(r.scenario.avgRequestKB).toBe(4);
    expect(r.scenario.avgResponseKB).toBe(100);
    expect(r.scenario.region).toBe("eu-north-1");
  });

  it("ignores supported irrelevant kinds without warning", () => {
    const r = parseManifests(`
apiVersion: v1
kind: Service
metadata:
  name: api-svc
spec:
  ports: []
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.warnings.some((w) => w.includes("Service"))).toBe(false);
  });

  it("warns on unsupported kinds", () => {
    const r = parseManifests(`
apiVersion: batch/v1
kind: Job
metadata:
  name: cleanup
spec: {}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          resources:
            requests:
              cpu: "1"
              memory: "2Gi"
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.warnings.some((w) => w.includes("Job"))).toBe(true);
  });
});
