"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AUTH_EVENT, hasSession, logout, startLogin } from "@/lib/spotify/auth";
import { getLanguage, languageLabel, languagesForProvider } from "@/lib/languages";
import { usePlayback, type Playback } from "@/hooks/usePlayback";
import { useLyrics } from "@/hooks/useLyrics";
import { useActiveLine } from "@/hooks/useClock";
import { useTranslations } from "@/hooks/useTranslations";
import { useSettings } from "@/hooks/useSettings";
import { useConfig } from "@/hooks/useConfig";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useVocabulary } from "@/hooks/useVocabulary";
import { usePronunciation } from "@/hooks/usePronunciation";
import { ConnectScreen } from "./ConnectScreen";
import { AccessScreen } from "./AccessScreen";
import { AdminPanel } from "./AdminPanel";
import { captureInviteFromUrl, useAccess } from "@/hooks/useAccess";
import type { AccessInfo } from "@/lib/access/types";
import { BASE_PATH } from "@/lib/runtime";
import { TopBar } from "./TopBar";
import { NowPlaying } from "./NowPlaying";
import { LyricsView } from "./LyricsView";
import { ExplanationPanel, type ExplainTarget } from "./ExplanationPanel";
import { VocabularyPanel } from "./VocabularyPanel";
import { ModeToggle, SettingsPanel } from "./SettingsPanel";
import { Banner, StateMessage, btn } from "./StateMessage";
import { IconRefresh, IconSpotify, Logo } from "./icons";

export function App() {
  const [hydrated, setHydrated] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  useEffect(() => {
    captureInviteFromUrl();
    const sync = () => setConnected(hasSession());
    sync();
    setHydrated(true);
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync); // other tabs
    // arrived via origin hop from startLogin()
    const params = new URLSearchParams(window.location.search);
    if (params.get("connect") === "1") {
      window.history.replaceState(null, "", `${BASE_PATH}/`);
      if (!hasSession()) startLogin().catch(() => {});
    }
    const n = sessionStorage.getItem("versio:notice");
    if (n) {
      setNotice(n);
      sessionStorage.removeItem("versio:notice");
    }
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const expire = useCallback((msg: string) => {
    setNotice(msg);
    logout();
  }, []);

  if (!hydrated)
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="animate-pulse">
          <Logo size={40} />
        </div>
      </div>
    );
  if (!connected) return <ConnectScreen notice={notice} />;
  return <Gate onExpired={expire} />;
}

/** Checks with the server whether this Spotify account may use the app. */
function Gate({ onExpired }: { onExpired: (msg: string) => void }) {
  const { state, reload } = useAccess();

  useEffect(() => {
    if (state.status === "error" && state.code === "unauthenticated") onExpired("Your Spotify session expired. Please reconnect.");
  }, [state, onExpired]);

  if (state.status === "loading")
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="animate-pulse">
          <Logo size={40} />
        </div>
      </div>
    );
  if (state.status === "error")
    return <AccessScreen kind={state.code === "spotify_not_registered" ? "not_registered" : "error"} detail={state.message} onRetry={reload} />;
  const { info, inviteError } = state;
  if (info.status !== "active") return <AccessScreen kind={info.status} name={info.displayName} inviteError={inviteError} onRetry={reload} />;
  return <Player onExpired={onExpired} access={info} reloadAccess={reload} />;
}

function Player({ onExpired, access, reloadAccess }: { onExpired: (msg: string) => void; access: AccessInfo; reloadAccess: () => void }) {
  const config = useConfig();
  const { settings, update } = useSettings();
  const playback = usePlayback(true);
  const track = playback.track;

  const [panel, setPanel] = useState<null | "settings" | "vocab" | "admin">(null);
  const [explain, setExplain] = useState<ExplainTarget | null>(null);
  const [lyricsNonce, setLyricsNonce] = useState(0);

  useEffect(() => {
    if (playback.status === "auth-expired") onExpired("Your Spotify session expired. Please reconnect.");
  }, [playback.status, onExpired]);

  // if the provider can't do the stored language (DeepL), fall back
  useEffect(() => {
    if (config && !languagesForProvider(config.provider).some((l) => l.code === settings.targetLang)) update({ targetLang: "en" });
  }, [config, settings.targetLang, update]);

  // close the explanation when the song changes
  useEffect(() => setExplain(null), [track?.key]);

  const lyrics = useLyrics(track, lyricsNonce);
  const ready = lyrics.status === "ready" && lyrics.trackKey === track?.key ? lyrics : null;
  const lines = ready && (ready.kind === "synced" || ready.kind === "plain") ? ready.lines : null;
  const synced = ready?.kind === "synced";

  const activeIndex = useActiveLine(lines, playback.anchor, settings.offsetMs, synced);

  const tr = useTranslations({
    enabled: !!config && config.provider !== "none" && !!lines,
    provider: config?.provider ?? "none",
    trackKey: track?.key ?? null,
    title: track?.name,
    artist: track?.artists.join(", "),
    lines,
    target: settings.targetLang,
    activeIndex,
  });

  const pron = usePronunciation({
    enabled: settings.showPronunciation && !!config?.pronunciation && !!lines,
    trackKey: track?.key ?? null,
    lines,
    title: track?.name,
    artist: track?.artists.join(", "),
  });

  const vocab = useVocabulary(!!config?.vocabularySync);

  const rgb = useDominantColor(track?.artUrlSmall ?? track?.artUrl ?? null);
  const theme = useMemo(() => {
    const [r, g, b] = rgb;
    const mix = (c: number) => Math.round(c + (255 - c) * 0.68);
    return {
      "--accent": `rgb(${r} ${g} ${b})`,
      "--accent-text": `rgb(${mix(r)} ${mix(g)} ${mix(b)})`,
      glow: `rgba(${r},${g},${b},0.55)`,
    };
  }, [rgb]);

  const select = useCallback(
    (i: number) => {
      if (!lines || !track) return;
      const line = lines[i];
      if (!line?.text.trim()) return;
      const neighbour = (dir: -1 | 1) => {
        for (let j = i + dir; j >= 0 && j < lines.length; j += dir) if (lines[j].text.trim()) return lines[j].text;
        return undefined;
      };
      setExplain({
        line: line.text,
        pronunciation: pron.map[line.text.trim()],
        translation: tr.map[line.text.trim()],
        previous: neighbour(-1),
        next: neighbour(1),
        title: track.name,
        artist: track.artists.join(", "),
      });
    },
    [lines, track, tr.map, pron.map],
  );

  const saveTerm = useCallback(
    (term: string, meaning: string) => {
      if (!track || !explain) return;
      vocab.add({
        term,
        meaning,
        line: explain.line,
        translation: explain.translation,
        trackName: track.name,
        artistName: track.artists.join(", "),
        targetLang: settings.targetLang,
      });
    },
    [track, explain, vocab, settings.targetLang],
  );

  const target = getLanguage(settings.targetLang);
  const sameLanguage = tr.status === "same-language";
  const showTranslation = settings.displayMode !== "original" && !sameLanguage && config?.provider !== "none";

  const metaPills = (
    <>
      {ready && (
        <span className="rounded-full bg-white/[0.05] px-3 py-1.5">
          {ready.kind === "synced" ? "Synced lyrics" : ready.kind === "plain" ? "Unsynced lyrics" : ready.kind === "instrumental" ? "Instrumental" : "No lyrics"}
          {ready.source && <span className="text-white/35"> · {ready.source.provider}</span>}
        </span>
      )}
      {tr.sourceLanguage && (
        <span className="rounded-full bg-white/[0.05] px-3 py-1.5">
          {languageLabel(tr.sourceLanguage)} → {target?.name}
        </span>
      )}
    </>
  );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden" style={theme as React.CSSProperties}>
      <Ambient glow={theme.glow} active={!!track} />

      <TopBar
        status={playback.status}
        targetLang={settings.targetLang}
        onLang={(targetLang) => update({ targetLang })}
        provider={config?.provider ?? "openai"}
        vocabCount={vocab.items.length}
        onVocab={() => setPanel("vocab")}
        onSettings={() => setPanel("settings")}
      />

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-4 px-4 md:px-8 lg:grid lg:grid-cols-[minmax(300px,400px)_1fr] lg:gap-16 xl:gap-24">
        {!track ? (
          <div className="lg:col-span-2">
            <EmptyPlayback playback={playback} />
          </div>
        ) : (
          <>
            <div className="shrink-0 lg:pb-10 lg:pt-6">
              <NowPlaying playback={playback} glow={theme.glow} meta={metaPills} />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 lg:pt-6">
                <ModeToggle value={settings.displayMode} onChange={(displayMode) => update({ displayMode })} />
                <div className="flex items-center gap-2 text-[12px] text-white/45">
                  {tr.status === "loading" && (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--accent-text)]" />
                      Translating…
                    </span>
                  )}
                  {sameLanguage && <span>Already in {target?.name}</span>}
                  {pron.status === "loading" && <span>Pronunciation…</span>}
                </div>
              </div>

              <div className="space-y-2">
                {playback.rateLimitedUntil && <Banner tone="warn">Spotify is rate-limiting requests — the clock keeps running, sync resumes in a moment.</Banner>}
                {playback.status === "paused" && synced && <Banner>Paused on Spotify</Banner>}
                {playback.status === "unsupported" && playback.message && <Banner tone="warn">{playback.message}</Banner>}
                {config?.provider === "none" && <Banner tone="warn">No translation provider configured — showing original lyrics. Add OPENAI_API_KEY or DEEPL_API_KEY.</Banner>}
                {tr.status === "error" && (
                  <Banner
                    tone="error"
                    action={
                      <button className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-white" onClick={tr.retry}>
                        <IconRefresh width={14} height={14} /> Retry
                      </button>
                    }
                  >
                    {tr.error}
                  </Banner>
                )}
                {pron.status === "error" && settings.showPronunciation && <Banner tone="warn">{pron.error}</Banner>}
                {ready?.kind === "plain" && <Banner tone="warn">Unsynced lyrics — no timing data exists for this song, so lines won't follow along.</Banner>}
              </div>

              <div className="relative min-h-0 flex-1">
                <LyricsArea
                  lyrics={lyrics}
                  ready={ready}
                  trackKey={track.key}
                  onRetry={() => setLyricsNonce((n) => n + 1)}
                  view={
                    lines && (
                      <LyricsView
                        trackKey={track.key}
                        lines={lines}
                        synced={synced}
                        activeIndex={activeIndex}
                        translations={tr.map}
                        pronunciations={settings.showPronunciation ? pron.map : undefined}
                        translating={tr.status === "loading"}
                        showTranslation={showTranslation}
                        mode={settings.displayMode}
                        targetLang={settings.targetLang}
                        sourceLang={tr.sourceLanguage}
                        onSelect={select}
                      />
                    )
                  }
                  track={track}
                />
              </div>
            </div>
          </>
        )}
      </main>

      <ExplanationPanel
        target={explain}
        onClose={() => setExplain(null)}
        targetLang={settings.targetLang}
        available={!!config?.explanations}
        onSave={saveTerm}
        isSaved={(t) => vocab.has(t, settings.targetLang)}
      />
      <VocabularyPanel open={panel === "vocab"} onClose={() => setPanel(null)} items={vocab.items} onRemove={vocab.remove} syncing={!!config?.vocabularySync} syncError={vocab.syncError} />
      {access.role === "admin" && access.accessControl && <AdminPanel open={panel === "admin"} onClose={() => setPanel("settings")} me={access.spotifyId} />}
      <SettingsPanel
        open={panel === "settings"}
        onClose={() => setPanel(null)}
        settings={settings}
        update={update}
        config={config}
        access={access}
        onOpenAdmin={() => setPanel("admin")}
        onOpen={reloadAccess}
        onDisconnect={() => {
          sessionStorage.setItem("versio:notice", "Disconnected from Spotify.");
          logout();
        }}
      />
    </div>
  );
}

function LyricsArea({
  lyrics,
  ready,
  view,
  onRetry,
  track,
}: {
  lyrics: ReturnType<typeof useLyrics>;
  ready: Extract<ReturnType<typeof useLyrics>, { status: "ready" }> | null;
  view: React.ReactNode;
  trackKey: string;
  onRetry: () => void;
  track: NonNullable<Playback["track"]>;
}) {
  if (lyrics.status === "loading" || (lyrics.status !== "error" && !ready))
    return (
      <div className="space-y-6 pt-[18vh]">
        {[80, 60, 72].map((w, i) => (
          <div key={i} className="h-9 animate-shimmer rounded-xl bg-[linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.09),rgba(255,255,255,0.03))] bg-[length:200%_100%] md:h-11" style={{ width: `${w}%`, opacity: 1 - i * 0.25 }} />
        ))}
      </div>
    );
  if (lyrics.status === "error")
    return (
      <StateMessage
        compact
        title="Couldn't load lyrics"
        body={lyrics.message}
        action={
          <button className={btn.ghost} onClick={onRetry}>
            <IconRefresh width={15} height={15} /> Try again
          </button>
        }
      />
    );
  if (ready?.kind === "instrumental") return <StateMessage compact title="Instrumental" body="No vocals in this one — just listen." />;
  if (ready?.kind === "not_found")
    return (
      <StateMessage
        compact
        title="No lyrics found"
        body={
          <>
            LRCLIB has no lyrics for “{track.name}” yet{track.isLocal ? " (local files often lack metadata)" : ""}. You can contribute synced lyrics at{" "}
            <a className="text-white underline underline-offset-2" href="https://lrclib.net" target="_blank" rel="noreferrer">
              lrclib.net
            </a>
            .
          </>
        }
      />
    );
  return <>{view}</>;
}

function EmptyPlayback({ playback }: { playback: Playback & { refresh?: () => void } }) {
  if (playback.status === "connecting")
    return (
      <div className="grid h-full place-items-center">
        <div className="flex items-center gap-3 text-white/50">
          <span className="h-2 w-2 animate-pulse rounded-full bg-spotify" /> Checking what's playing…
        </div>
      </div>
    );
  if (playback.status === "error")
    return <StateMessage icon={<IconRefresh />} title="Can't reach Spotify" body={playback.message ?? "Retrying automatically…"} />;
  return (
    <StateMessage
      icon={<IconSpotify width={26} height={26} className="text-spotify" />}
      title={playback.status === "unsupported" ? "Nothing to translate" : "Play something on Spotify"}
      body={playback.message ?? "Start a song on any device — phone, desktop or speaker. Versio picks it up automatically."}
      action={
        <a className={btn.ghost} href="https://open.spotify.com" target="_blank" rel="noreferrer">
          Open Spotify
        </a>
      }
    />
  );
}

/** Slow, blurred colour fields derived from the artwork. */
function Ambient({ glow, active }: { glow: string; active: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-[15%] -top-[25%] h-[75vh] w-[75vh] rounded-full blur-[120px] transition-[background-color,opacity] duration-[1500ms]" style={{ backgroundColor: glow, opacity: active ? 0.45 : 0.12 }} />
      <div className="absolute -bottom-[35%] right-[-10%] h-[70vh] w-[70vh] rounded-full blur-[140px] transition-[background-color,opacity] duration-[1500ms]" style={{ backgroundColor: glow, opacity: active ? 0.22 : 0.08 }} />
      <div className="grain absolute inset-0 opacity-[0.035]" />
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-[#090909]/70" />
    </div>
  );
}
