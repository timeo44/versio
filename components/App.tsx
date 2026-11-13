"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AUTH_EVENT, hasSession, logout, startLogin } from "@/lib/spotify/auth";
import { getLanguage, languageLabel, languagesForProvider } from "@/lib/languages";
import { usePlayback, type DeviceInfo, type Playback } from "@/hooks/usePlayback";
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
import { MAX_OFFSET_MS, calibrateOffset, positionAt } from "@/lib/playback/position";
import { alignHeard } from "@/lib/lyrics/align";
import { usePlayerControls } from "@/hooks/usePlayerControls";
import { listenSupported, useListenCalibration } from "@/hooks/useListenCalibration";
import { TopBar } from "./TopBar";
import { NowPlaying } from "./NowPlaying";
import { LyricsView } from "./LyricsView";
import { ExplanationPanel, type ExplainTarget } from "./ExplanationPanel";
import { VocabularyPanel } from "./VocabularyPanel";
import { ModeToggle, SettingsPanel } from "./SettingsPanel";
import { Banner, StateMessage, btn } from "./StateMessage";
import { IconMic, IconRefresh, IconSpotify, Logo } from "./icons";

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
  const { settings, update, loaded, setDeviceOffset, removeDevice, claimLegacyOffset } = useSettings();
  const playback = usePlayback(true);
  const controls = usePlayerControls(playback);
  const track = playback.track;
  const device = playback.device;

  const [panel, setPanel] = useState<null | "settings" | "vocab" | "admin">(null);
  const [explain, setExplain] = useState<ExplainTarget | null>(null);
  const [lyricsNonce, setLyricsNonce] = useState(0);
  /** "Tap the line being sung" mode — the next tapped line re-syncs the clock */
  const [calibrating, setCalibrating] = useState(false);
  const [calibrated, setCalibrated] = useState<{ offsetMs: number; previous: number; device: DeviceInfo; method: "tap" | "listen" } | null>(null);

  // Timing is stored per Spotify device: the same device keeps its offset, a new one starts at 0.
  const offsetMs = device ? (settings.deviceOffsets[device.key]?.offsetMs ?? 0) : 0;
  const setOffset = useCallback((ms: number) => device && setDeviceOffset(device, Math.round(ms)), [device, setDeviceOffset]);

  // the old single offset moves onto the first device we see
  useEffect(() => {
    if (loaded && device && settings.offsetMs) claimLegacyOffset(device);
  }, [loaded, device, settings.offsetMs, claimLegacyOffset]);

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

  const activeIndex = useActiveLine(lines, playback.anchor, offsetMs, synced);

  const applyCalibration = useCallback(
    (next: number, method: "tap" | "listen") => {
      if (!device) return;
      setCalibrated({ offsetMs: next, previous: offsetMs, device, method });
      setDeviceOffset(device, next);
    },
    [device, offsetMs, setDeviceOffset],
  );

  // ── listen to calibrate ──
  const listenTrack = useRef<string | null>(null);
  const listen = useListenCalibration(
    (words, clipStart) => {
      if (!lines || !playback.anchor || listenTrack.current !== track?.key) return listen.fail("The song changed while listening — try again.");
      const anchor = playback.anchor;
      const res = alignHeard(lines, words, (sec) => positionAt(anchor, clipStart + sec * 1000, 0), offsetMs);
      if (!res) return listen.fail("Couldn't match what I heard to the lyrics. The music must be audible to the microphone (speaker, not headphones) while someone sings — or tap the line instead.");
      applyCalibration(Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, res.offsetMs)), "listen");
    },
    { title: track?.name, artist: track?.artists.join(", ") },
  );
  const listening = listen.state.phase === "listening" || listen.state.phase === "matching";
  const canListen = !!config?.listen && listenSupported();

  const startListening = useCallback(() => {
    setPanel(null);
    setExplain(null);
    setCalibrated(null);
    setCalibrating(false);
    listenTrack.current = track?.key ?? null;
    void listen.start();
  }, [listen, track?.key]);

  const startCalibration = useCallback(() => {
    setPanel(null);
    setExplain(null);
    setCalibrated(null);
    listen.cancel();
    setCalibrating(true);
  }, [listen]);

  // calibration only makes sense with timed lyrics on a known device
  const canCalibrate = synced && !!device && !!playback.anchor;
  useEffect(() => {
    if (!canCalibrate) {
      setCalibrating(false);
      if (listen.state.phase !== "idle") listen.cancel();
    }
  }, [canCalibrate]); // eslint-disable-line react-hooks/exhaustive-deps

  // a different device has its own timing — close calibration feedback for the old one
  useEffect(() => {
    setCalibrated((c) => (c && c.device.key !== device?.key ? null : c));
  }, [device?.key]);

  // the confirmation fades after a few seconds
  useEffect(() => {
    if (!calibrated) return;
    const id = window.setTimeout(() => setCalibrated(null), 6000);
    return () => window.clearTimeout(id);
  }, [calibrated]);

  /** Calibration tap: this line is starting right now → re-sync from there. */
  const resyncAt = useCallback(
    (i: number) => {
      const t = lines?.[i]?.timeMs;
      if (t == null || !playback.anchor || !device) return;
      applyCalibration(calibrateOffset(playback.anchor, performance.now(), t), "tap");
      setCalibrating(false);
    },
    [lines, playback.anchor, device, applyCalibration],
  );

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

  /** Normal tap on a line: jump the song there (synced lyrics + controls), otherwise explain it. */
  const tapLine = useCallback(
    (i: number) => {
      const t = lines?.[i]?.timeMs;
      if (synced && controls.available && t != null) {
        // the line shows at song position (t − offset), so that's where it is actually sung
        controls.seek(Math.max(0, t - offsetMs));
        return;
      }
      select(i);
    },
    [lines, synced, controls, offsetMs, select],
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

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-3 px-4 sm:gap-4 md:px-8 lg:grid lg:grid-cols-[minmax(300px,400px)_1fr] lg:gap-16 xl:gap-24">
        {!track ? (
          <div className="lg:col-span-2">
            <EmptyPlayback playback={playback} />
          </div>
        ) : (
          <>
            <div className="shrink-0 lg:pb-10 lg:pt-6">
              <NowPlaying playback={playback} glow={theme.glow} meta={metaPills} controls={controls} />
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-col gap-2 pb-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pb-2 lg:pt-6">
                <ModeToggle className="w-full sm:w-auto" value={settings.displayMode} onChange={(displayMode) => update({ displayMode })} />
                <div className="flex items-center gap-2 px-1 text-[12px] text-white/45 empty:hidden">
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
                {calibrating && (
                  <Banner
                    tone="accent"
                    action={
                      <span className="flex shrink-0 items-center gap-3 font-semibold text-white">
                        {canListen && (
                          <button className="inline-flex items-center gap-1" onClick={startListening} aria-label="Listen instead">
                            <IconMic width={14} height={14} /> Listen
                          </button>
                        )}
                        <button onClick={() => setCalibrating(false)}>Cancel</button>
                      </span>
                    }
                  >
                    Tap a line the moment it starts being sung — lyrics re-sync from there.
                  </Banner>
                )}
                {listen.state.phase === "listening" && <ListeningBanner startedAt={listen.state.startedAt} durationMs={listen.state.durationMs} onCancel={listen.cancel} />}
                {listen.state.phase === "matching" && (
                  <Banner tone="accent" action={<button className="shrink-0 font-semibold text-white" onClick={listen.cancel}>Cancel</button>}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--accent-text)]" /> Matching what I heard to the lyrics…
                    </span>
                  </Banner>
                )}
                {listen.state.phase === "error" && (
                  <Banner
                    tone="warn"
                    action={
                      <span className="flex shrink-0 items-center gap-3 font-semibold text-white">
                        <button onClick={startCalibration}>Tap instead</button>
                        <button onClick={listen.clear} aria-label="Dismiss">✕</button>
                      </span>
                    }
                  >
                    {listen.state.message}
                  </Banner>
                )}
                {calibrated && !calibrating && !listening && (
                  <Banner
                    action={
                      <span className="flex shrink-0 items-center gap-3 font-semibold text-white">
                        <button onClick={calibrated.method === "listen" ? startListening : startCalibration}>Again</button>
                        <button
                          onClick={() => {
                            setDeviceOffset(calibrated.device, calibrated.previous);
                            setCalibrated(null);
                          }}
                        >
                          Undo
                        </button>
                      </span>
                    }
                  >
                    Re-synced for {calibrated.device.name} · {formatOffset(calibrated.offsetMs)}
                  </Banner>
                )}
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
                        onSelect={calibrating ? resyncAt : listening ? noop : tapLine}
                        onExplain={select}
                        calibrating={calibrating}
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
        canCalibrate={canCalibrate}
        onCalibrate={startCalibration}
        onListen={canListen ? startListening : undefined}
        device={device}
        offsetMs={offsetMs}
        setOffset={setOffset}
        removeDevice={removeDevice}
        onOpen={reloadAccess}
        onDisconnect={() => {
          sessionStorage.setItem("versio:notice", "Disconnected from Spotify.");
          logout();
        }}
      />
    </div>
  );
}

function ListeningBanner({ startedAt, durationMs, onCancel }: { startedAt: number; durationMs: number; onCancel: () => void }) {
  const [left, setLeft] = useState(durationMs);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, durationMs - (performance.now() - startedAt)));
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [startedAt, durationMs]);
  return (
    <Banner tone="accent" action={<button className="shrink-0 font-semibold text-white" onClick={onCancel}>Cancel</button>}>
      <span className="flex items-center gap-2">
        <IconMic width={14} height={14} className="shrink-0 animate-pulse text-[color:var(--accent-text)]" />
        <span>Listening… {Math.ceil(left / 1000)} s — keep the music audible to the mic.</span>
      </span>
      <span className="mt-1.5 block h-0.5 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full bg-white/70 transition-[width] duration-200 ease-linear" style={{ width: `${100 - (left / durationMs) * 100}%` }} />
      </span>
    </Banner>
  );
}

const noop = () => {};

function formatOffset(ms: number) {
  if (ms === 0) return "0 s";
  return `${ms > 0 ? "+" : "−"}${(Math.abs(ms) / 1000).toFixed(2)} s`;
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
