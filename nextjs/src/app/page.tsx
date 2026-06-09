import Link from "next/link";
import { Logo } from "@/components/Logo";

const K8S_LEARN_URL = "https://kubernetes.io/training/";

const HERO_POINTS = [
  "Run your YAML live",
  "Catch manifest errors",
  "Project AWS cost",
  "Measure carbon emissions",
  "Hover to learn each resource",
];

const FEATURES = [
  {
    title: "Bring your own manifests",
    body: "Paste standard Kubernetes YAML — Deployments, StatefulSets, HPAs — and watch a live cluster topology materialize. No cluster, account, or install required.",
  },
  {
    title: "See the cost",
    body: "Projected monthly AWS spend updates in milliseconds as you edit, so the link between a replica count and a bill is immediate and tangible.",
  },
  {
    title: "See the carbon",
    body: "Projected monthly CO₂ emissions sit right beside the cost — green-software pedagogy made concrete, grounded in the SCI spec and real grid data.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Logo />
        <Link
          href="/sandbox"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
        >
          Open Sandbox
        </Link>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center sm:pt-24">
        <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          Live Kubernetes topology simulator — real-time cost &amp; carbon
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
          Understand the <span className="text-emerald-400">cost</span> and{" "}
          <span className="text-emerald-400">carbon</span> of your cluster —
          before you deploy it.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          Learnetes turns your Kubernetes manifests into a live topology, a cost
          dashboard, and a carbon dashboard — all in the browser, all in real
          time. No cluster needed.
        </p>

        {/* Key learning points */}
        <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm font-medium text-slate-300">
          {HERO_POINTS.map((point) => (
            <li key={point} className="inline-flex items-center gap-1.5">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-emerald-400"
              >
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
              {point}
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/sandbox"
            className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-8 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 sm:w-auto"
          >
            Open the Sandbox
          </Link>
          <a
            href={K8S_LEARN_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-900/60 px-8 py-3 text-base font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 sm:w-auto"
          >
            Learn Kubernetes ↗
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6"
            >
              <h2 className="text-lg font-semibold text-slate-100">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-8 text-center text-xs text-slate-600">
          Learnetes · Live Kubernetes topology simulator with real-time cost and carbon ·
          prototype build
        </div>
      </footer>
    </main>
  );
}
