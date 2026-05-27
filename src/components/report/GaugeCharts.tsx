"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

/**
 * Recharts-rendering internals for the Site IQ gauges, split into their own
 * client module so `recharts` (~127KB gzip) is only fetched on the report page
 * via `next/dynamic`, not on every route. Visually identical to the original.
 */

/** Semantic score bands (red / amber / green) - never decorative gradients. */
const BAND = { weak: "#ef4444", fair: "#f59e0b", good: "#10b981" } as const;

function bandColor(score: number): string {
  if (score >= 90) return BAND.good;
  if (score >= 50) return BAND.fair;
  return BAND.weak;
}

/** Disable recharts entry animation when the user asked for reduced motion. */
function animationActive(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? false
    : true;
}

/** Hero gauge chart (270deg sweep, fixed 0-100 domain). */
export function SiteIqGaugeChart({ score }: { score: number }) {
  const data = [{ name: "Site IQ", value: score, fill: bandColor(score) }];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart
        data={data}
        startAngle={225}
        endAngle={-45}
        innerRadius="72%"
        outerRadius="100%"
        barSize={18}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar
          dataKey="value"
          cornerRadius={12}
          background={{ fill: "var(--color-gauge-track, #1f2937)" }}
          isAnimationActive={animationActive()}
        />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

/** Small per-dimension ring chart. */
export function DimensionRingChart({ score }: { score: number }) {
  const data = [{ value: score, fill: bandColor(score) }];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart
        data={data}
        startAngle={90}
        endAngle={-270}
        innerRadius="70%"
        outerRadius="100%"
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar
          dataKey="value"
          cornerRadius={8}
          background={{ fill: "var(--color-gauge-track, #1f2937)" }}
          isAnimationActive={animationActive()}
        />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}
