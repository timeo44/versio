import { env } from "./env";
import { TranslationUnavailableError } from "./translate";

export interface TranscribedWord {
  word: string;
  /** seconds from the start of the clip */
  start: number;
  end: number;
}

/** Largest clip we accept (≈ 10 s of opus/aac is far below this). */
export const MAX_CLIP_BYTES = 1_500_000;

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a", "audio/aac": "m4a" };

export function clipExtension(mime: string): string | null {
  return EXT[mime.split(";")[0].trim().toLowerCase()] ?? null;
}

export const transcriptionAvailable = () => !!env("OPENAI_API_KEY");

/**
 * Speech-to-text with per-word timestamps (Whisper). Used for "listen to
 * calibrate": the client matches the words to the lyric lines and derives the
 * timing offset from when they were heard.
 */
export async function transcribeClip(audio: Uint8Array<ArrayBuffer>, mime: string, hint?: string): Promise<{ text: string; words: TranscribedWord[] }> {
  if (!transcriptionAvailable()) throw new TranslationUnavailableError("Listening needs an OpenAI API key.", 501);
  const ext = clipExtension(mime);
  if (!ext) throw new TranslationUnavailableError("Unsupported audio format.", 400);

  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime.split(";")[0] }), `clip.${ext}`);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  if (hint) form.append("prompt", hint.slice(0, 200));

  const base = (env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error?.code ?? body?.error?.type;
    if (code === "insufficient_quota" || code === "billing_hard_limit_reached") {
      throw new TranslationUnavailableError("OpenAI credits are used up — top up at platform.openai.com → Billing.", 402);
    }
    if (res.status === 401) throw new TranslationUnavailableError("The OpenAI API key was rejected.", 503);
    throw new TranslationUnavailableError(body?.error?.message || `OpenAI responded ${res.status}`, res.status === 429 ? 429 : 503);
  }
  const data = await res.json();
  const words: TranscribedWord[] = Array.isArray(data?.words)
    ? data.words
        .filter((w: unknown): w is TranscribedWord => !!w && typeof (w as TranscribedWord).word === "string" && typeof (w as TranscribedWord).start === "number")
        .map((w: TranscribedWord) => ({ word: w.word, start: w.start, end: typeof w.end === "number" ? w.end : w.start }))
    : [];
  return { text: typeof data?.text === "string" ? data.text : "", words };
}
