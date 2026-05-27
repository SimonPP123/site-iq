"use client";

import dynamic from "next/dynamic";

/**
 * Site IQ gauges. The recharts-rendering internals live in a separate client
 * module (`GaugeCharts`) and are loaded via `next/dynamic({ ssr: false })`, so
 * recharts (~127KB gzip) is only fetched on the report page, not on every route.
 * The static labels/score readouts render immediately; only the decorative arc
 * is deferred. Visually identical to the previous statically-imported version.
 */

// Lightweight fallbacks keep the gauge's footprint (and centered text) stable while recharts
// streams in: a faint placeholder ring (no layout shift, no spinner, no blank circle on slow nets).
const SiteIqGaugeChart = dynamic(
  () => import("./GaugeCharts").then((m) => m.SiteIqGaugeChart),
  { ssr: false, loading: () => <div className="h-full w-full rounded-full border-[10px] border-border/30" /> },
);

const DimensionRingChart = dynamic(
  () => import("./GaugeCharts").then((m) => m.DimensionRingChart),
  { ssr: false, loading: () => <div className="h-full w-full rounded-full border-[6px] border-border/30" /> },
);

/**
 * Hero "Site IQ" gauge. Fixed 0-100 scale via PolarAngleAxis domain (so the arc
 * fills proportionally to the score, not to the data max). 270deg sweep.
 */
export function SiteIqGauge({ score, grade }: { score: number; grade: string }) {
  return (
    <div
      className="relative h-64 w-64"
      role="img"
      aria-label={`Site IQ score ${score} out of 100, grade ${grade}`}
    >
      <div aria-hidden className="absolute inset-0">
        <SiteIqGaugeChart score={score} />
      </div>
      {/* aria-hidden: the outer role="img" label already announces the score; hiding
          the visible number prevents screen readers from reading it twice. */}
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-semibold tabular-nums">{score}</span>
        <span className="text-sm text-muted-foreground">Site IQ · {grade}</span>
      </div>
    </div>
  );
}

/** Small per-dimension ring (SEO / Tracking / AI-Readiness / Tech). */
export function DimensionRing({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative h-20 w-20"
        role="img"
        aria-label={`${label}: ${Math.round(score)} out of 100`}
      >
        <div aria-hidden className="absolute inset-0">
          <DimensionRingChart score={score} />
        </div>
        {/* aria-hidden: the outer role="img" label already announces the score. */}
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-sm font-medium tabular-nums">
          {Math.round(score)}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
