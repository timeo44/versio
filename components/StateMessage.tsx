import type { ReactNode } from "react";

export function StateMessage({ icon, title, body, action, compact }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`mx-auto flex max-w-md animate-fadeUp flex-col items-center text-center ${compact ? "py-10" : "py-24"}`}>
      {icon && <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.04] text-white/70">{icon}</div>}
      <h3 className="text-xl font-semibold tracking-tight text-white">{title}</h3>
      {body && <p className="mt-2 text-[15px] leading-relaxed text-white/55">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Banner({ tone = "neutral", children, action }: { tone?: "neutral" | "warn" | "error" | "accent"; children: ReactNode; action?: ReactNode }) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.04] text-white/70",
    warn: "border-amber-300/20 bg-amber-300/[0.07] text-amber-100/90",
    error: "border-rose-400/20 bg-rose-400/[0.08] text-rose-100/90",
    accent: "border-[color:var(--accent-text)]/30 bg-white/[0.07] text-white/90",
  };
  return (
    <div className={`flex animate-fadeUp items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-[13px] ${tones[tone]}`}>
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  );
}

export const btn = {
  primary:
    "inline-flex select-none items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition active:scale-[0.97] active:bg-white/85 hover:bg-white/90",
  ghost:
    "inline-flex select-none items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/85 transition active:scale-[0.97] active:bg-white/[0.12] hover:bg-white/[0.08] hover:text-white",
  spotify:
    "inline-flex select-none items-center justify-center gap-2.5 rounded-full bg-spotify px-7 py-3.5 text-[15px] font-semibold text-black shadow-[0_10px_40px_-10px_rgba(30,215,96,0.6)] transition hover:bg-[#3be477] active:scale-[0.97]",
  icon: "grid h-10 w-10 select-none place-items-center rounded-full text-white/65 transition active:scale-90 active:bg-white/[0.12] hover:bg-white/[0.08] hover:text-white",
};
