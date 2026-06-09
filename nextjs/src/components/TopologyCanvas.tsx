"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Topology } from "@/lib/topology";
import type { Scenario } from "@/lib/types";
import { LEARN, type LearnKey } from "@/lib/learn";
import { LearnDrawer } from "@/components/LearnDrawer";
import { getHelperLines } from "@/lib/helperLines";

type Tone = "amber" | "slate" | "violet" | "emerald";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface TopoData extends Record<string, unknown> {
  learnKey: LearnKey;
  title: string;
  subtitle: string;
  tone: Tone;
  kind: "traffic" | "ingress" | "controlPlane" | "cluster";
  rps?: number;
  podCount?: number;
  capacity?: number;
  hpaLabel?: string | null;
  gravity?: boolean;
  hasTarget?: boolean;
  hasSource?: boolean;
  onSelect: (k: LearnKey) => void;
}

interface NoteData extends Record<string, unknown> {
  num: number;
  text: string;
  rot: number;
}

type TopoNodeType = Node<TopoData, "topo">;

const TONES: Record<Tone, { border: string; glow: string; dot: string; mini: string }> = {
  amber: {
    border: "border-amber-500/50",
    glow: "hover:shadow-[0_0_22px_-2px_rgba(251,191,36,0.55)]",
    dot: "!bg-amber-400",
    mini: "#f59e0b",
  },
  slate: {
    border: "border-slate-500/60",
    glow: "hover:shadow-[0_0_22px_-2px_rgba(148,163,184,0.45)]",
    dot: "!bg-slate-300",
    mini: "#94a3b8",
  },
  violet: {
    border: "border-violet-500/50",
    glow: "hover:shadow-[0_0_22px_-2px_rgba(167,139,250,0.6)]",
    dot: "!bg-violet-400",
    mini: "#8b5cf6",
  },
  emerald: {
    border: "border-emerald-500/50",
    glow: "hover:shadow-[0_0_24px_-2px_rgba(52,211,153,0.6)]",
    dot: "!bg-emerald-400",
    mini: "#10b981",
  },
};

// ---------------------------------------------------------------------------
// Pods with gravity — a tiny physics box. Pods fall, bounce off the node
// walls, collide with each other, and can be grabbed and flung around. They
// never leave their node's boundary.
// ---------------------------------------------------------------------------
function PodBox({
  count,
  gravity,
  onSelect,
}: {
  count: number;
  gravity: boolean;
  onSelect: (k: LearnKey) => void;
}) {
  const W = 186;
  const H = 90;
  const R = 9; // pod half-size (pods are 18px squares)

  const areaRef = useRef<HTMLDivElement>(null);
  const podRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sim = useRef<{ x: number; y: number; vx: number; vy: number }[]>([]);
  const dragIdx = useRef<number | null>(null);
  const movedRef = useRef(0);
  const lastRect = useRef<{ left: number; top: number } | null>(null);
  const raf = useRef<number | null>(null);
  const [hover, setHover] = useState(false);

  // (re)seed the simulation when pod count changes, preserving existing pods
  useEffect(() => {
    const prev = sim.current;
    sim.current = Array.from({ length: count }, (_, i) =>
      prev[i] ?? {
        x: R + Math.random() * (W - 2 * R),
        y: R + Math.random() * (H / 2),
        vx: (Math.random() - 0.5) * 3,
        vy: 0,
      },
    );
  }, [count]);

  useEffect(() => {
    const g = 0.5;
    const rest = 0.5; // wall restitution
    const fric = 0.985;
    const inertia = 0.7; // how hard pods slosh when the node is dragged

    const step = () => {
      // Inertial pseudo-force: when the containing node moves on screen, pods
      // lag behind (Newton's first law) and slosh against the walls.
      let mdx = 0;
      let my = 0;
      const area = areaRef.current;
      if (area) {
        const rect = area.getBoundingClientRect();
        const sx = rect.width / W || 1;
        const sy = rect.height / H || 1;
        if (lastRect.current) {
          mdx = (rect.left - lastRect.current.left) / sx;
          my = (rect.top - lastRect.current.top) / sy;
          if (Math.abs(mdx) > 40 || Math.abs(my) > 40) {
            mdx = 0; // ignore zoom / fitView jumps
            my = 0;
          }
        }
        lastRect.current = { left: rect.left, top: rect.top };
      }

      const pods = sim.current;
      for (let i = 0; i < pods.length; i++) {
        if (dragIdx.current === i) continue;
        const p = pods[i];
        p.vx -= mdx * inertia;
        p.vy -= my * inertia;
        if (gravity) p.vy += g;
        else p.vy *= 0.9;
        p.vx *= fric;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < R) { p.x = R; p.vx = Math.abs(p.vx) * rest; }
        if (p.x > W - R) { p.x = W - R; p.vx = -Math.abs(p.vx) * rest; }
        if (p.y < R) { p.y = R; p.vy = Math.abs(p.vy) * rest; }
        if (p.y > H - R) {
          p.y = H - R;
          p.vy = -Math.abs(p.vy) * rest;
          if (Math.abs(p.vy) < 0.7) p.vy = 0;
        }
      }
      // Pairwise separation. Pods keep a small gap (non-polar detachment) so
      // they never visually stick together, but the push is gentle and heavily
      // damped — no rubber-ball bounce, they just settle a hair apart.
      const gap = 3;
      const minDist = 2 * R + gap;
      for (let i = 0; i < pods.length; i++) {
        for (let j = i + 1; j < pods.length; j++) {
          const a = pods[i];
          const b = pods[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          if (dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const push = overlap / 2; // resolve position fully so they don't intersect
            const kick = overlap * 0.04; // tiny detachment velocity, not bouncy
            if (dragIdx.current !== i) { a.x -= nx * push; a.y -= ny * push; a.vx -= nx * kick; a.vy -= ny * kick; }
            if (dragIdx.current !== j) { b.x += nx * push; b.y += ny * push; b.vx += nx * kick; b.vy += ny * kick; }
          }
        }
      }
      for (let i = 0; i < pods.length; i++) {
        const el = podRefs.current[i];
        if (el) el.style.transform = `translate(${pods[i].x - R}px, ${pods[i].y - R}px)`;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [gravity]);

  const onPodDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const area = areaRef.current;
    if (!area) return;
    dragIdx.current = i;
    movedRef.current = 0;
    let last = { x: e.clientX, y: e.clientY };

    const onMove = (ev: PointerEvent) => {
      const rect = area.getBoundingClientRect();
      const sx = rect.width / W;
      const sy = rect.height / H;
      const p = sim.current[i];
      if (!p) return;
      const ndx = ev.clientX - last.x;
      const ndy = ev.clientY - last.y;
      movedRef.current += Math.abs(ndx) + Math.abs(ndy);
      p.x = clamp((ev.clientX - rect.left) / sx, R, W - R);
      p.y = clamp((ev.clientY - rect.top) / sy, R, H - R);
      p.vx = clamp((ndx / sx) * 0.6, -16, 16);
      p.vy = clamp((ndy / sy) * 0.6, -16, 16);
      last = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = () => {
      // a tap (negligible movement) counts as a click → open the Pod drawer
      if (movedRef.current < 4) onSelect("pod");
      dragIdx.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="relative">
      {hover && (
        <div className="pointer-events-none absolute -top-2 left-1/2 z-30 w-max max-w-[180px] -translate-x-1/2 -translate-y-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-left text-[10px] font-normal leading-snug text-slate-200 shadow-xl">
          <span className="block font-semibold text-slate-100">{LEARN.pod.title}</span>
          <span className="block text-slate-300">{LEARN.pod.short}</span>
          <span className="mt-0.5 block text-emerald-300">Click to learn more →</span>
        </div>
      )}
      <div
        ref={areaRef}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="nodrag nopan relative overflow-hidden rounded-md border border-emerald-500/30 bg-slate-950/60"
        style={{ width: W, height: H }}
      >
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-emerald-500/25" />
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              podRefs.current[i] = el;
            }}
            onPointerDown={onPodDown(i)}
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: "none" }}
            className="absolute left-0 top-0 h-[18px] w-[18px] cursor-grab rounded-sm bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)] transition-shadow hover:shadow-[0_0_10px_rgba(52,211,153,0.95)] active:cursor-grabbing"
          />
        ))}
      </div>
    </div>
  );
}

function NodeBody({ data }: { data: TopoData }) {
  switch (data.kind) {
    case "traffic": {
      const rps = data.rps ?? 0;
      const intensity = Math.min(100, Math.log10(Math.max(rps, 1)) * 25);
      return (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 animate-pulse rounded-full bg-amber-400"
              style={{
                width: `${Math.max(20, intensity - i * 10)}%`,
                opacity: 0.4 + i * 0.2,
                animationDelay: `${i * 150}ms`,
              }}
            />
          ))}
        </div>
      );
    }
    case "ingress":
      return (
        <div className="rounded-md border border-slate-500 bg-slate-700/40 px-2 py-1.5 text-center text-[10px] font-medium text-slate-200">
          LB
        </div>
      );
    case "controlPlane":
      return (
        <div className="space-y-1.5">
          <div className="rounded-md border border-violet-400/50 bg-violet-500/10 px-2 py-1 text-[10px] font-mono text-violet-200">
            Deployment
          </div>
          {data.hpaLabel && (
            <div className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-[10px] font-mono text-emerald-200">
              {data.hpaLabel}
            </div>
          )}
        </div>
      );
    case "cluster":
      return <PodBox count={data.podCount ?? 0} gravity={data.gravity ?? true} onSelect={data.onSelect} />;
  }
}

function TopoNode({ data, selected }: NodeProps<TopoNodeType>) {
  const [hover, setHover] = useState(false);
  const entry = LEARN[data.learnKey];
  const tone = TONES[data.tone];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => data.onSelect(data.learnKey)}
      className={`group relative w-[210px] cursor-pointer rounded-xl border bg-slate-900/85 p-3 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 ${tone.border} ${tone.glow} ${
        selected ? "ring-2 ring-emerald-400/80 shadow-[0_0_26px_-2px_rgba(52,211,153,0.65)]" : ""
      }`}
    >
      {data.hasTarget && (
        <Handle type="target" position={Position.Left} className={`!h-2.5 !w-2.5 !border-2 !border-slate-900 ${tone.dot}`} />
      )}
      {data.hasSource && (
        <Handle type="source" position={Position.Right} className={`!h-2.5 !w-2.5 !border-2 !border-slate-900 ${tone.dot}`} />
      )}

      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{data.title}</span>
        <span className="opacity-0 transition group-hover:opacity-100">
          <DragDots />
        </span>
      </div>
      <div className="mb-2 text-xs font-medium text-slate-200">{data.subtitle}</div>

      <NodeBody data={data} />

      {hover && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[210px] -translate-x-1/2 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-left text-[11px] font-normal leading-snug text-slate-200 shadow-xl">
          <span className="block font-semibold text-slate-100">{entry.title}</span>
          <span className="block text-slate-300">{entry.short}</span>
          <span className="mt-0.5 block text-[10px] text-emerald-300">Click to learn more →</span>
        </div>
      )}
    </div>
  );
}

// Comic-style guide annotation: a dashed note + a hand-drawn arrow pointer.
function NoteNode({ data }: NodeProps<Node<NoteData, "annotation">>) {
  return (
    <div className="pointer-events-none w-[200px] select-none" style={{ transform: `rotate(${data.rot}deg)` }}>
      <div className="rounded-lg border border-dashed border-emerald-400/60 bg-slate-900/85 px-3 py-2 text-[11px] italic leading-snug text-slate-300 shadow-lg backdrop-blur-sm">
        <span className="mr-1 font-bold not-italic text-emerald-300">{data.num}.</span>
        {data.text}
      </div>
      <svg viewBox="0 0 80 46" className="ml-7 h-9 w-20 text-emerald-400/70" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M8 4 C 2 24, 30 24, 40 40" strokeDasharray="3 4" strokeLinecap="round" />
        <path d="M40 40 l -10 -2 M40 40 l -3 -10" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function DragDots() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 text-slate-500" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="4" r="1.4" />
      <circle cx="11" cy="4" r="1.4" />
      <circle cx="5" cy="8" r="1.4" />
      <circle cx="11" cy="8" r="1.4" />
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="11" cy="12" r="1.4" />
    </svg>
  );
}

const nodeTypes = { topo: TopoNode, annotation: NoteNode };

// ---------------------------------------------------------------------------
// Helper lines renderer — draws the snap guide lines on a canvas overlay.
// ---------------------------------------------------------------------------
function HelperLines({ horizontal, vertical }: { horizontal?: number; vertical?: number }) {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const transform = useStore((s) => s.transform);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpi = window.devicePixelRatio || 1;
    canvas.width = width * dpi;
    canvas.height = height * dpi;
    ctx.scale(dpi, dpi);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const [tx, ty, scale] = transform;
    if (typeof vertical === "number") {
      const x = vertical * scale + tx;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    if (typeof horizontal === "number") {
      const y = horizontal * scale + ty;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [width, height, transform, horizontal, vertical]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute left-0 top-0 z-10"
      style={{ width, height }}
    />
  );
}

interface Props {
  scenario: Scenario;
  topology: Topology;
  hpaPresent: boolean;
  hpaMin?: number;
  hpaMax?: number;
}

interface BuildOpts {
  onSelect: (k: LearnKey) => void;
  gravity: boolean;
  guide: boolean;
}

const GUIDE_TEXT: Record<string, string> = {
  traffic: "Where it starts — user requests per second flowing in.",
  ingress: "The front door: a load balancer routing requests to pods.",
  controlPlane: "The brain — keeps replicas running; HPA scales them with load.",
  node: "A worker machine. Pods live inside — drag them, they fall with gravity!",
};

function buildGraph(
  { scenario, topology, hpaPresent, hpaMin, hpaMax }: Props,
  { onSelect, gravity, guide }: BuildOpts,
): { nodes: Node[]; edges: Edge[] } {
  const edgeStyle = { stroke: "#34d399", strokeWidth: 2 };
  const marker = { type: MarkerType.ArrowClosed, color: "#34d399", width: 18, height: 18 };

  const nodes: Node[] = [
    {
      id: "traffic",
      type: "topo",
      position: { x: 0, y: 150 },
      data: {
        learnKey: "traffic",
        title: "Traffic",
        subtitle: `${scenario.requestsPerSecond.toLocaleString()} RPS`,
        tone: "amber",
        kind: "traffic",
        rps: scenario.requestsPerSecond,
        hasSource: true,
        onSelect,
      } satisfies TopoData,
    },
    {
      id: "ingress",
      type: "topo",
      position: { x: 280, y: 150 },
      data: {
        learnKey: "ingress",
        title: "Ingress",
        subtitle: "ALB",
        tone: "slate",
        kind: "ingress",
        hasTarget: true,
        hasSource: true,
        onSelect,
      } satisfies TopoData,
    },
    {
      id: "controlPlane",
      type: "topo",
      position: { x: 560, y: 140 },
      data: {
        learnKey: "controlPlane",
        title: "Control plane",
        subtitle: hpaPresent ? "Deployment + HPA" : "Deployment",
        tone: "violet",
        kind: "controlPlane",
        hpaLabel: hpaPresent ? `HPA ${hpaMin}-${hpaMax}` : null,
        hasTarget: true,
        hasSource: true,
        onSelect,
      } satisfies TopoData,
    },
  ];

  const edges: Edge[] = [
    { id: "t-i", source: "traffic", target: "ingress", animated: true, style: edgeStyle, markerEnd: marker },
    { id: "i-c", source: "ingress", target: "controlPlane", animated: true, style: edgeStyle, markerEnd: marker },
  ];

  const nodeCount = topology.nodeCount;
  const spread = (nodeCount - 1) * 150;
  const firstNodeY = 150 - spread / 2;
  for (let i = 0; i < nodeCount; i++) {
    const podsInThisNode = Math.min(
      topology.podsPerNode,
      topology.effectiveReplicas - i * topology.podsPerNode,
    );
    const id = `node-${i}`;
    nodes.push({
      id,
      type: "topo",
      position: { x: 880, y: firstNodeY + i * 150 },
      data: {
        learnKey: "node",
        title: `Node ${i + 1}`,
        subtitle: `${podsInThisNode} pod${podsInThisNode === 1 ? "" : "s"}`,
        tone: "emerald",
        kind: "cluster",
        podCount: podsInThisNode,
        capacity: topology.podsPerNode,
        gravity,
        hasTarget: true,
        onSelect,
      } satisfies TopoData,
    });
    edges.push({
      id: `c-${id}`,
      source: "controlPlane",
      target: id,
      animated: true,
      style: edgeStyle,
      markerEnd: marker,
    });
  }

  if (guide) {
    // Notes are CHILD nodes of the card they describe, so they travel with it
    // when dragged. Position is relative to the parent; the arrow points down
    // from the note to the card sitting just below it.
    const notes: { key: string; parentId: string; num: number; rot: number }[] = [
      { key: "traffic", parentId: "traffic", num: 1, rot: -2 },
      { key: "ingress", parentId: "ingress", num: 2, rot: 1.5 },
      { key: "controlPlane", parentId: "controlPlane", num: 3, rot: -1.5 },
      { key: "node", parentId: "node-0", num: 4, rot: 2 },
    ];
    for (const n of notes) {
      nodes.push({
        id: `note-${n.key}`,
        type: "annotation",
        parentId: n.parentId,
        position: { x: -6, y: -128 },
        draggable: false,
        selectable: false,
        data: { num: n.num, text: GUIDE_TEXT[n.key], rot: n.rot } satisfies NoteData,
      });
    }
  }

  return { nodes, edges };
}

function structureKey(p: Props): string {
  return [
    p.scenario.requestsPerSecond,
    p.topology.nodeCount,
    p.topology.effectiveReplicas,
    p.topology.podsPerNode,
    p.hpaPresent,
    p.hpaMin,
    p.hpaMax,
  ].join("|");
}

function Flow(props: Props) {
  const [selected, setSelected] = useState<LearnKey | null>(null);
  const [guide, setGuide] = useState(true);
  const [snap, setSnap] = useState(true);
  const [gravity, setGravity] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helperH, setHelperH] = useState<number | undefined>();
  const [helperV, setHelperV] = useState<number | undefined>();

  const onSelect = useCallback((k: LearnKey) => setSelected(k), []);

  const initial = useMemo(
    () => buildGraph(props, { onSelect, gravity, guide }),
    // build once; live updates handled in the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [nodes, setNodes, onNodesChangeDefault] = useNodesState<Node>(initial.nodes);
  const [edges, setEdges] = useEdgesState<Edge>(initial.edges);
  const { fitView } = useReactFlow();

  const dataKey = structureKey(props);
  // Only the node COUNT changes the layout. Live RPS/pod-count updates flow
  // through on every tick, but we must not re-fit the viewport each frame or the
  // canvas would constantly zoom while traffic ramps.
  const layoutKey = props.topology.nodeCount;
  const prevLayout = useRef(layoutKey);

  // live-update data while preserving dragged positions; rebuild when settings change
  useEffect(() => {
    const next = buildGraph(props, { onSelect, gravity, guide });
    setNodes((curr) => {
      const byId = new Map(curr.map((n) => [n.id, n.position]));
      return next.nodes.map((n) => (byId.has(n.id) ? { ...n, position: byId.get(n.id)! } : n));
    });
    setEdges(next.edges);
    if (prevLayout.current !== layoutKey) {
      prevLayout.current = layoutKey;
      requestAnimationFrame(() => fitView({ duration: 500, padding: 0.2 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, guide, gravity]);

  // intercept node changes to compute snap guide lines while dragging
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setHelperH(undefined);
      setHelperV(undefined);
      const change = changes[0];
      if (
        snap &&
        changes.length === 1 &&
        change.type === "position" &&
        change.dragging &&
        change.position
      ) {
        const lines = getHelperLines(change, nodes.filter((n) => n.type === "topo"));
        change.position.x = lines.snapPosition.x ?? change.position.x;
        change.position.y = lines.snapPosition.y ?? change.position.y;
        setHelperH(lines.horizontal);
        setHelperV(lines.vertical);
      }
      onNodesChangeDefault(changes);
    },
    [snap, nodes, onNodesChangeDefault],
  );

  const resetLayout = useCallback(() => {
    const fresh = buildGraph(props, { onSelect, gravity, guide });
    setNodes(fresh.nodes);
    requestAnimationFrame(() => fitView({ duration: 500, padding: 0.2 }));
  }, [props, onSelect, gravity, guide, setNodes, fitView]);

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.4}
        maxZoom={1.75}
        snapToGrid={snap}
        snapGrid={[16, 16]}
        proOptions={{ hideAttribution: false }}
        className="bg-slate-950"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1e293b" />
        <Controls
          position="bottom-right"
          className="!border-slate-700 !bg-slate-900 [&_button]:!border-slate-700 [&_button]:!bg-slate-900 [&_button]:!fill-slate-300 [&_button:hover]:!bg-slate-800"
        />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          className="!rounded-md !border !border-slate-700 !bg-slate-900"
          maskColor="rgba(2,6,23,0.7)"
          nodeColor={(n) => (n.type === "annotation" ? "#334155" : TONES[(n.data as TopoData).tone]?.mini ?? "#334155")}
          nodeStrokeColor="#0f172a"
        />
        <HelperLines horizontal={helperH} vertical={helperV} />

        <Panel position="top-left">
          <div className="flex items-center gap-2">
            <ToolButton onClick={resetLayout} label="Reset layout">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5" />
            </ToolButton>
            <ToolButton onClick={() => fitView({ duration: 500, padding: 0.2 })} label="Fit">
              <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
            </ToolButton>
            <div className="relative">
              <ToolButton onClick={() => setSettingsOpen((o) => !o)} label="Settings" active={settingsOpen}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
              </ToolButton>
              {settingsOpen && (
                <div className="absolute left-0 top-full z-20 mt-1.5 w-52 rounded-md border border-slate-700 bg-slate-900/95 p-2 text-xs shadow-2xl backdrop-blur">
                  <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Canvas settings
                  </div>
                  <Toggle label="Guide descriptions" checked={guide} onChange={setGuide} />
                  <Toggle label="Snap &amp; helper lines" checked={snap} onChange={setSnap} />
                  <Toggle label="Pod gravity" checked={gravity} onChange={setGravity} />
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel position="top-right">
          <div className="rounded-md border border-slate-700 bg-slate-900/90 px-2.5 py-2 text-[10px] text-slate-400 backdrop-blur">
            <div className="mb-1 font-semibold uppercase tracking-wide text-slate-500">
              Drag · zoom · drag pods · click to learn
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Legend color="bg-amber-400" label="Traffic" />
              <Legend color="bg-slate-300" label="Ingress" />
              <Legend color="bg-violet-400" label="Control plane" />
              <Legend color="bg-emerald-400" label="Nodes" />
            </div>
          </div>
        </Panel>
      </ReactFlow>

      <LearnDrawer entryKey={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ToolButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-md border bg-slate-900/90 px-2.5 py-1.5 text-xs font-medium backdrop-blur transition ${
        active
          ? "border-emerald-500/60 text-emerald-300"
          : "border-slate-700 text-slate-200 hover:border-emerald-500/60 hover:text-emerald-300"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      {label}
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded px-1 py-1 text-left text-slate-300 transition hover:bg-slate-800"
    >
      <span>{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-600"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${checked ? "left-3.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export function TopologyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
