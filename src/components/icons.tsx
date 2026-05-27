import type { SVGProps } from "react";

/**
 * Inline SVG icon set (Feather / lucide-style strokes), self-hosted to avoid an extra runtime
 * dependency. Each export has the SAME component API as lucide-react (`<Icon className=... />`),
 * so call sites only swap the import path. 24x24 viewBox, `currentColor`, 2px round strokes.
 */
const BASE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function Sun(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function Moon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function Menu(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

export function X(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function CheckCircle2(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function XCircle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

export function CircleDashed(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...BASE} {...props}>
      <path d="M10.1 2.18a10 10 0 0 1 3.8 0" />
      <path d="M17.2 4.11a10 10 0 0 1 2.69 2.69" />
      <path d="M21.82 10.1a10 10 0 0 1 0 3.8" />
      <path d="M19.89 17.2a10 10 0 0 1-2.69 2.69" />
      <path d="M13.9 21.82a10 10 0 0 1-3.8 0" />
      <path d="M6.8 19.89a10 10 0 0 1-2.69-2.69" />
      <path d="M2.18 13.9a10 10 0 0 1 0-3.8" />
      <path d="M4.11 6.8a10 10 0 0 1 2.69-2.69" />
    </svg>
  );
}
