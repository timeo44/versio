"use client";

import { useEffect, useState } from "react";
import type { AppUserDTO, CreditsInfo, InviteDTO, Limits } from "@/lib/access/types";
import { SPOTIFY_DEV_MODE_USER_LIMIT } from "@/lib/access/types";
import { useAdmin } from "@/hooks/useAdmin";
import { BASE_PATH } from "@/lib/runtime";
import { Sheet } from "./Sheet";
import { IconCheck, IconChevron, IconPlus, IconRefresh, IconTrash } from "./icons";
import { btn } from "./StateMessage";

const DASHBOARD = "https://developer.spotify.com/dashboard";

const inviteLink = (code: string) => `${window.location.origin}${BASE_PATH}/?invite=${code}`;

function mailto(inv: InviteDTO) {
  const link = inviteLink(inv.code);
  const hi = inv.name ? `Hey ${inv.name}` : "Hey";
  const body = `${hi}!\n\nIch habe dich zu Versio eingeladen – Songs auf Spotify live mit übersetzten Lyrics.\n\n1. Öffne diesen Link: ${link}\n2. Tippe auf «Connect Spotify» und melde dich mit deinem Spotify-Konto (${inv.email}) an.\n3. Spiel einen Song ab.\n\nDer Link gilt 14 Tage und funktioniert einmal.`;
  return `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent("Deine Einladung zu Versio")}&body=${encodeURIComponent(body)}`;
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—");
const fmtLimit = (n: number | null | undefined) => (n === null || n === undefined ? "∞" : n.toLocaleString());

export function AdminPanel({ open, onClose, me }: { open: boolean; onClose: () => void; me: string }) {
  const { data, error, busy, act, invite, credits, loadCredits, saveBalance } = useAdmin(open);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<InviteDTO | null>(null);

  const users = data?.users ?? [];
  const pending = users.filter((u) => u.status === "pending");
  const members = users.filter((u) => u.status !== "pending");
  const activeCount = users.filter((u) => u.status === "active").length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inv = await invite(email, name);
    if (inv) {
      setCreated(inv);
      setEmail("");
      setName("");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="User management">
      <div className="space-y-8">
        {error && <p className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-2.5 text-sm text-rose-100/90">{error}</p>}

        <CreditsCard credits={credits} busy={busy} onRefresh={() => loadCredits(true)} onSave={saveBalance} />

        {/* Spotify slots */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Spotify test users</p>
            <p className={`text-sm tabular-nums ${activeCount > SPOTIFY_DEV_MODE_USER_LIMIT ? "text-amber-300" : "text-white/70"}`}>
              {activeCount} / {SPOTIFY_DEV_MODE_USER_LIMIT}
            </p>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-spotify transition-all" style={{ width: `${Math.min(100, (activeCount / SPOTIFY_DEV_MODE_USER_LIMIT) * 100)}%` }} />
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-white/45">
            Spotify only lets accounts you add in the{" "}
            <a href={DASHBOARD} target="_blank" rel="noreferrer" className="text-white/80 underline underline-offset-2">
              Developer Dashboard
            </a>{" "}
            → your app → User Management log in (max. {SPOTIFY_DEV_MODE_USER_LIMIT}). Add every invited email there too.
          </p>
        </div>

        {/* Invite */}
        <Group label="Invite someone">
          <form onSubmit={submit} className="space-y-2">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Spotify email address" className={input} />
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className={`${input} flex-1`} />
              <button type="submit" disabled={busy || !email} className={`${btn.primary} shrink-0 disabled:opacity-40`}>
                <IconPlus width={15} height={15} /> Invite
              </button>
            </div>
          </form>

          {created && (
            <div className="mt-3 animate-fadeUp rounded-2xl border border-spotify/25 bg-spotify/[0.06] p-4">
              <p className="text-sm font-semibold text-white">Invite created for {created.email}</p>
              <ol className="mt-2.5 space-y-2 text-[13px] text-white/70">
                <li className="flex gap-2">
                  <Step n={1} />
                  <span>
                    Add <b className="text-white">{created.email}</b> in the{" "}
                    <a href={DASHBOARD} target="_blank" rel="noreferrer" className="text-white underline underline-offset-2">
                      Spotify Dashboard
                    </a>{" "}
                    → User Management.
                  </span>
                </li>
                <li className="flex gap-2">
                  <Step n={2} />
                  <span>Send the link — it works once and expires in 14 days.</span>
                </li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={inviteLink(created.code)} />
                <a className={btn.ghost} href={mailto(created)}>
                  Send email
                </a>
              </div>
            </div>
          )}
        </Group>

        {/* Pending */}
        {pending.length > 0 && (
          <Group label={`Waiting for approval · ${pending.length}`}>
            <ul className="space-y-2">
              {pending.map((u) => (
                <li key={u.spotifyId} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{u.displayName || u.spotifyId}</p>
                    <p className="truncate text-[12px] text-white/40">Spotify: {u.spotifyId}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button className={`${btn.ghost} !px-3`} disabled={busy} onClick={() => act({ action: "deleteUser", spotifyId: u.spotifyId })}>
                      Decline
                    </button>
                    <button className={`${btn.primary} !px-3 !py-2`} disabled={busy} onClick={() => act({ action: "updateUser", spotifyId: u.spotifyId, status: "active" })}>
                      <IconCheck width={14} height={14} /> Approve
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Group>
        )}

        {/* Members */}
        <Group label={`Users · ${members.length}`}>
          {!data ? (
            <p className="text-sm text-white/40">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {members.map((u) => (
                <UserRow key={u.spotifyId} u={u} isMe={u.spotifyId === me} defaults={data.defaults} busy={busy} act={act} />
              ))}
            </ul>
          )}
        </Group>

        {/* Open invites */}
        {data && data.invites.length > 0 && (
          <Group label={`Open invites · ${data.invites.length}`}>
            <ul className="space-y-2">
              {data.invites.map((inv) => {
                const expired = Date.parse(inv.expiresAt) < Date.now();
                return (
                  <li key={inv.code} className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{inv.name ? `${inv.name} · ` : ""}{inv.email}</p>
                      <p className={`text-[12px] ${expired ? "text-rose-300/80" : "text-white/40"}`}>{expired ? "Expired" : `Valid until ${fmtDate(inv.expiresAt)}`}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!expired && <CopyButton text={inviteLink(inv.code)} compact />}
                      <button className={btn.icon} disabled={busy} onClick={() => act({ action: "deleteInvite", code: inv.code })} aria-label="Delete invite">
                        <IconTrash width={16} height={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Group>
        )}

        {/* Default limits */}
        {data && <DefaultLimits defaults={data.defaults} busy={busy} onSave={(limits) => act({ action: "setDefaults", limits })} />}
      </div>
    </Sheet>
  );
}

const input =
  "w-full rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-hidden focus:ring-1 focus:ring-white/20";

function Step({ n }: { n: number }) {
  return <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/15 text-[10px] font-bold text-white">{n}</span>;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">{label}</h3>
      {children}
    </section>
  );
}

function CopyButton({ text, compact }: { text: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this link:", text);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <button onClick={copy} className={compact ? `${btn.ghost} !px-3 !py-1.5 text-[12px]` : btn.ghost}>
      {done ? <IconCheck width={14} height={14} className="text-spotify" /> : null}
      {done ? "Copied" : compact ? "Copy link" : "Copy invite link"}
    </button>
  );
}

// ── Limits ────────────────────────────────────────────────────

const LIMIT_FIELDS: { key: keyof Limits; label: string }[] = [
  { key: "translatePerHour", label: "Lines / hour" },
  { key: "translatePerDay", label: "Lines / day" },
  { key: "explainPerHour", label: "Explanations / hour" },
  { key: "explainPerDay", label: "Explanations / day" },
];

type Draft = Record<keyof Limits, string>;
const toDraft = (l: Partial<Limits> | null | undefined): Draft => ({
  translatePerHour: l?.translatePerHour == null ? "" : String(l.translatePerHour),
  translatePerDay: l?.translatePerDay == null ? "" : String(l.translatePerDay),
  explainPerHour: l?.explainPerHour == null ? "" : String(l.explainPerHour),
  explainPerDay: l?.explainPerDay == null ? "" : String(l.explainPerDay),
});

function LimitInputs({ draft, setDraft, placeholders }: { draft: Draft; setDraft: (d: Draft) => void; placeholders: (k: keyof Limits) => string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {LIMIT_FIELDS.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-[11px] text-white/45">{f.label}</span>
          <input
            inputMode="numeric"
            value={draft[f.key]}
            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value.replace(/[^\d]/g, "") })}
            placeholder={placeholders(f.key)}
            className={`${input} tabular-nums`}
          />
        </label>
      ))}
    </div>
  );
}

function DefaultLimits({ defaults, busy, onSave }: { defaults: Limits; busy: boolean; onSave: (l: Record<string, number | null>) => void }) {
  const [draft, setDraft] = useState<Draft>(toDraft(defaults));
  useEffect(() => setDraft(toDraft(defaults)), [defaults]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(defaults));
  return (
    <Group label="Default rate limits">
      <p className="mb-3 text-[12px] leading-relaxed text-white/45">
        Applies to every non-admin user without own limits. Empty = unlimited. A song is roughly 30–60 lines; translations already cached are free. Admins are never limited.
      </p>
      <LimitInputs draft={draft} setDraft={setDraft} placeholders={() => "∞"} />
      <button
        className={`${btn.primary} mt-3 disabled:opacity-40`}
        disabled={busy || !dirty}
        onClick={() => onSave(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v === "" ? null : Number(v)])))}
      >
        Save defaults
      </button>
    </Group>
  );
}

function UserRow({
  u,
  isMe,
  defaults,
  busy,
  act,
}: {
  u: AppUserDTO;
  isMe: boolean;
  defaults: Limits;
  busy: boolean;
  act: (b: Record<string, unknown>) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(toDraft(u.limits));
  const [mail, setMail] = useState(u.email ?? "");
  useEffect(() => {
    setDraft(toDraft(u.limits));
    setMail(u.email ?? "");
  }, [u.limits, u.email]);

  const eff = (k: keyof Limits) => (u.limits && k in u.limits ? u.limits[k] : defaults[k]);
  const admin = u.role === "admin";
  const blocked = u.status === "blocked";

  const saveLimits = () => {
    const overrides = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
    act({ action: "updateUser", spotifyId: u.spotifyId, limits: Object.keys(overrides).length ? overrides : null });
  };

  return (
    <li className={`rounded-2xl border border-white/[0.05] bg-white/[0.03] ${blocked ? "opacity-60" : ""}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-white">
            {u.displayName || u.spotifyId}
            {isMe && <span className="text-[11px] font-normal text-white/40">you</span>}
            {admin && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">Admin</span>}
            {blocked && <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">Blocked</span>}
          </p>
          <p className="truncate text-[12px] text-white/40">
            {u.email ?? "no email"} · today {u.usage?.translate ?? 0}
            {admin ? "" : `/${fmtLimit(eff("translatePerDay"))}`} lines · {u.usage?.explain ?? 0}
            {admin ? "" : `/${fmtLimit(eff("explainPerDay"))}`} expl.
          </p>
        </div>
        <IconChevron width={16} height={16} className={`shrink-0 text-white/40 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="animate-fadeUp space-y-4 border-t border-white/[0.05] px-4 pb-4 pt-3">
          <dl className="grid grid-cols-2 gap-y-1 text-[12px]">
            <dt className="text-white/40">Spotify ID</dt>
            <dd className="truncate text-right text-white/70">{u.spotifyId}</dd>
            <dt className="text-white/40">Joined</dt>
            <dd className="text-right text-white/70">{fmtDate(u.createdAt)}</dd>
            <dt className="text-white/40">Last active</dt>
            <dd className="text-right text-white/70">{fmtDate(u.lastSeenAt)}</dd>
            <dt className="text-white/40">This hour</dt>
            <dd className="text-right tabular-nums text-white/70">
              {u.usage?.translateHour ?? 0} lines · {u.usage?.explainHour ?? 0} expl.
            </dd>
          </dl>

          <div>
            <span className="mb-1 block text-[11px] text-white/45">Email (for your reference)</span>
            <div className="flex gap-2">
              <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} className={`${input} flex-1`} placeholder="name@example.com" />
              {mail !== (u.email ?? "") && (
                <button className={btn.ghost} disabled={busy} onClick={() => act({ action: "updateUser", spotifyId: u.spotifyId, email: mail || null })}>
                  Save
                </button>
              )}
            </div>
          </div>

          {!admin && (
            <div>
              <p className="mb-2 text-[11px] text-white/45">Own limits — empty uses the default</p>
              <LimitInputs draft={draft} setDraft={setDraft} placeholders={(k) => `${fmtLimit(defaults[k])} (default)`} />
              {JSON.stringify(draft) !== JSON.stringify(toDraft(u.limits)) && (
                <button className={`${btn.primary} mt-2.5`} disabled={busy} onClick={saveLimits}>
                  Save limits
                </button>
              )}
            </div>
          )}

          {!isMe && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button className={btn.ghost} disabled={busy} onClick={() => act({ action: "updateUser", spotifyId: u.spotifyId, role: admin ? "user" : "admin" })}>
                {admin ? "Remove admin" : "Make admin"}
              </button>
              <button className={btn.ghost} disabled={busy} onClick={() => act({ action: "updateUser", spotifyId: u.spotifyId, status: blocked ? "active" : "blocked" })}>
                {blocked ? "Unblock" : "Block"}
              </button>
              <button
                className={`${btn.ghost} !border-rose-400/20 !text-rose-200 hover:!bg-rose-400/10`}
                disabled={busy}
                onClick={() => window.confirm(`Remove ${u.displayName || u.spotifyId}? They'll need a new invite.`) && act({ action: "deleteUser", spotifyId: u.spotifyId })}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── OpenAI credits ────────────────────────────────────────────

const BILLING = "https://platform.openai.com/settings/organization/billing/overview";
const ADMIN_KEYS = "https://platform.openai.com/settings/organization/admin-keys";
const usd = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `$${n.toFixed(2)}`);

function CreditsCard({ credits, busy, onRefresh, onSave }: { credits: CreditsInfo | null; busy: boolean; onRefresh: () => void; onSave: (b: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const remaining = credits?.remaining ?? null;
  const pct = credits?.balance ? Math.max(0, Math.min(100, ((remaining ?? 0) / credits.balance) * 100)) : 0;
  const low = remaining !== null && credits?.balance ? remaining / credits.balance < 0.15 : false;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n)) return;
    onSave(n);
    setEditing(false);
    setValue("");
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">OpenAI credits</p>
        {credits?.adminKey && (
          <button onClick={onRefresh} className="grid h-7 w-7 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white" aria-label="Refresh">
            <IconRefresh width={14} height={14} />
          </button>
        )}
      </div>

      {!credits ? (
        <p className="mt-2 text-[13px] text-white/40">Loading…</p>
      ) : !credits.adminKey ? (
        <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-white/50">
          <p>OpenAI doesn't expose your balance via API, but Versio can track your real spend with an <b className="text-white/80">admin key</b>:</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Create one at{" "}
              <a href={ADMIN_KEYS} target="_blank" rel="noreferrer" className="text-white/80 underline underline-offset-2">
                platform.openai.com → Admin keys
              </a>{" "}
              (read-only is enough).
            </li>
            <li>
              Supabase → Edge Functions → Secrets → add <code className="text-white/80">OPENAI_ADMIN_KEY</code>.
            </li>
          </ol>
        </div>
      ) : (
        <>
          {credits.error && <p className="mt-2 text-[12px] text-rose-300/90">{credits.error}</p>}
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <p className={`text-[28px] font-bold tabular-nums leading-none ${low ? "text-amber-300" : "text-white"}`}>{remaining !== null ? usd(remaining) : "—"}</p>
              <p className="mt-1 text-[12px] text-white/45">{remaining !== null ? "estimated left" : "enter your balance to see what's left"}</p>
            </div>
            <div className="text-right text-[12px] tabular-nums text-white/55">
              <p>today {usd(credits.spentToday)}</p>
              <p>this month {usd(credits.spentMonth)}</p>
            </div>
          </div>
          {credits.balance !== null && (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full transition-all ${low ? "bg-amber-400" : "bg-spotify"}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </>
      )}

      {credits && (
        <div className="mt-3 border-t border-white/[0.05] pt-3">
          {editing ? (
            <form onSubmit={submit} className="flex gap-2">
              <input
                autoFocus
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Balance in USD, e.g. 9.85"
                className={`${input} flex-1 tabular-nums`}
              />
              <button type="submit" disabled={busy || !value} className={`${btn.primary} shrink-0 disabled:opacity-40`}>
                Save
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-2 text-[12px] text-white/45">
              <span>
                {credits.balance !== null
                  ? `${usd(credits.balance)} on ${fmtDate(credits.asOf)} · ${usd(credits.spentSinceAsOf)} used since`
                  : "Copy the balance from your OpenAI billing page:"}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <a href={BILLING} target="_blank" rel="noreferrer" className={`${btn.ghost} !px-3 !py-1.5 text-[12px]`}>
                  Billing
                </a>
                <button onClick={() => setEditing(true)} className={`${btn.ghost} !px-3 !py-1.5 text-[12px]`}>
                  {credits.balance !== null ? "Update" : "Enter balance"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
