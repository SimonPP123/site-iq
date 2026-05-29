/**
 * Hero emblem - a score gauge that mirrors the report's own 0-100 grade visual: a near-full accent
 * ring with the letter grade + score in the center. Pure inline SVG, so it is crisp at any size,
 * weighs nothing, and themes itself via the design tokens (accent / foreground / muted) through
 * `currentColor` - no light/dark asset swap needed. Decorative (aria-hidden): the headline beside it
 * carries the meaning. Replaces the old generic stock "tech orb" PNG.
 */
const R = 48;
const CIRC = 2 * Math.PI * R;
const PROGRESS = 0.92; // illustrative grade (A / 92) - the emblem shows what a report delivers

export function HeroScoreEmblem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* faint full track */}
      <circle cx="60" cy="60" r={R} stroke="currentColor" strokeOpacity="0.12" strokeWidth="8" className="text-foreground" />
      {/* score arc (~92%) - starts at top, sweeps clockwise, rounded caps */}
      <circle
        cx="60"
        cy="60"
        r={R}
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - PROGRESS)}
        transform="rotate(-90 60 60)"
        className="text-accent"
      />
      {/* letter grade + score, echoing the report's GradePill */}
      <text x="60" y="53" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="36" fontWeight="700" className="text-foreground">
        A
      </text>
      <text x="60" y="83" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="14" fontWeight="600" className="text-muted-foreground">
        92
      </text>
    </svg>
  );
}
