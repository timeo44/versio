import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);
export const IconBookmark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 4h12v16l-6-4-6 4z" />
  </svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const IconArrowDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);
export const IconGlobe = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
  </svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />
  </svg>
);
export const IconPause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M7.5 4.6v14.8a1 1 0 001.5.86l12.2-7.4a1 1 0 000-1.72L9 3.74a1 1 0 00-1.5.86z" />
  </svg>
);
export const IconNext = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M3 6.2v11.6a.8.8 0 001.24.67L12 13.2v4.6a.8.8 0 001.24.67l8.4-5.8a.8.8 0 000-1.34l-8.4-5.8A.8.8 0 0012 6.2v4.6L4.24 5.53A.8.8 0 003 6.2z" />
  </svg>
);
export const IconPrevious = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none" style={{ transform: "scaleX(-1)", ...p.style }}>
    <path d="M3 6.2v11.6a.8.8 0 001.24.67L12 13.2v4.6a.8.8 0 001.24.67l8.4-5.8a.8.8 0 000-1.34l-8.4-5.8A.8.8 0 0012 6.2v4.6L4.24 5.53A.8.8 0 003 6.2z" />
  </svg>
);
export const IconMic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0014 0M12 18v3" />
  </svg>
);
export const IconTap = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 11V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v4a6 6 0 01-6 6h-.5a6 6 0 01-4.6-2.2L4.6 15.6a1.5 1.5 0 012.3-1.9L9 16" />
  </svg>
);
export const IconSpotify = ({ wave = "#090909", ...p }: SVGProps<SVGSVGElement> & { wave?: string }) => (
  <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden {...p}>
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="M6.5 9.3c3.8-1.1 8-.8 11.2 1M7.2 12.6c3.1-.9 6.5-.6 9.2.9M7.8 15.7c2.5-.7 5-.5 7.2.7" stroke={wave} strokeWidth="1.7" strokeLinecap="round" fill="none" />
  </svg>
);
export const IconSparkle = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </svg>
);
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);

/** Brand mark: two offset strokes — original and translation. */
export const Logo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="9" fill="#151515" />
    <path d="M8 12.5h16" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    <path d="M8 19.5h10" stroke="#1ed760" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 0.2, 0.4].map((d) => (
        <span
          key={d}
          className={`w-[3px] origin-bottom rounded-full bg-spotify ${playing ? "animate-eq" : ""}`}
          style={{ height: "100%", animationDelay: `${d}s`, transform: playing ? undefined : "scaleY(0.35)" }}
        />
      ))}
    </span>
  );
}
