"use client";

import { useEffect, type ReactNode } from "react";
import { IconClose } from "./icons";

/** Side drawer on desktop, bottom sheet on mobile. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className={`absolute flex flex-col border-white/[0.07] bg-[#111111]/95 shadow-2xl backdrop-blur-xl transition-transform duration-500 ease-glide
          inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[28px] border-t
          md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[440px] md:rounded-[28px] md:border
          ${open ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-[110%]"}`}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15 md:hidden" />
        <header className="flex items-center justify-between gap-4 px-6 pb-3 pt-4 md:pt-6">
          <h2 className="text-[15px] font-semibold tracking-tight text-white">{title}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close">
            <IconClose width={18} height={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-8">{children}</div>
        {footer && <div className="border-t border-white/[0.06] px-6 py-4">{footer}</div>}
      </aside>
    </div>
  );
}
