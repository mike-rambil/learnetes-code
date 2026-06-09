import type { SVGProps } from "react";

/**
 * Learnetes logo mark — a heptagon (Kubernetes helm/cluster) wrapping a leaf
 * (carbon / green software), in the brand emerald. Mirrors src/app/icon.svg.
 */
export function LogoMark({
  title = "Learnetes",
  ...props
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="lrn-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1220" />
          <stop offset="1" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="lrn-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="24" fill="url(#lrn-bg)" />
      <polygon
        points="50,16 75.8,28.4 82.2,56.34 64.3,78.7 35.7,78.7 17.8,56.34 24.2,28.4"
        fill="none"
        stroke="#34d399"
        strokeWidth="3.5"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <path d="M50,24 C64,35 64,55 50,74 C36,55 36,35 50,24 Z" fill="url(#lrn-leaf)" />
      <path d="M50,30 L50,68" stroke="#020617" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M50,42 L41,47 M50,42 L59,47 M50,53 L43,58 M50,53 L57,58"
        stroke="#020617"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
    </svg>
  );
}

/** Full lockup: mark + "Learnetes" wordmark. */
export function Logo({
  className = "",
  markClassName = "h-7 w-7",
  wordmarkClassName = "text-lg",
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={markClassName} />
      <span className={`font-bold tracking-tight ${wordmarkClassName}`}>
        <span className="text-emerald-400">Learn</span>etes
      </span>
    </span>
  );
}
