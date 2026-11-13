import { getLanguage } from "@/lib/languages";
import type { Explanation, ExplainRequest, ProviderName, TranslateRequest, TranslateResponse } from "@/lib/translation/types";
import { LruCache } from "./cache";
import { env } from "./env";

export class TranslationUnavailableError extends Error {
  constructor(message: string, public status = 503) {
    super(message);
    this.name = "TranslationUnavailableError";
  }
}

export function activeProvider(): ProviderName {
  const wanted = (env("TRANSLATION_PROVIDER") || "").toLowerCase();
  const hasOpenAI = !!env("OPENAI_API_KEY");
  const hasDeepL = !!env("DEEPL_API_KEY");
  if (wanted === "openai" && hasOpenAI) return "openai";
  if (wanted === "deepl" && hasDeepL) return "deepl";
  if (hasOpenAI) return "openai";
  if (hasDeepL) return "deepl";
  return "none";
}

export const explanationsAvailable = () => !!env("OPENAI_API_KEY");

const lineCache = new LruCache<string>(20_000, 1000 * 60 * 60 * 24 * 7);
const langCache = new LruCache<string>(2000, 1000 * 60 * 60 * 24 * 7);
const explainCache = new LruCache<Explanation>(2000, 1000 * 60 * 60 * 24 * 7);

const ctxKey = (r: TranslateRequest) => `${r.context?.artist ?? ""}|${r.context?.title ?? ""}`.toLowerCase();

// ── OpenAI ───────────────────────────────────────────────────

async function openaiJSON<T>(system: string, user: string, timeoutMs = 25_000, model?: string): Promise<T> {
  const base = (env("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || env("OPENAI_MODEL") || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.error?.message || `OpenAI responded ${res.status}`;
    throw new TranslationUnavailableError(res.status === 429 ? "Translation provider is rate-limiting. Retrying shortly." : msg, res.status === 429 ? 429 : 503);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new TranslationUnavailableError("Empty response from OpenAI.");
  return JSON.parse(content) as T;
}

const TRANSLATE_SYSTEM = (targetName: string) => `You are a professional song-lyrics translator.
Translate each numbered lyric line into ${targetName}.
Rules:
- Convey the intended meaning, tone and emotion — natural, idiomatic ${targetName}, never word-for-word.
- Render slang, idioms and cultural references with an equivalent a native speaker would actually say; keep names, places and brands.
- Exactly one output line per input line, same order. Never merge, split, skip or add lines.
- Keep vocal ad-libs (oh, yeah, la la) and onomatopoeia as they are.
- If a line is already in ${targetName}, return it unchanged.
- No explanations, notes, quotes or numbering in the translations.
Respond with JSON: {"sourceLanguage": "<ISO 639-1 code of the original lyrics>", "translations": ["...", ...]}`;

async function translateOpenAI(req: TranslateRequest, missing: string[]) {
  const lang = getLanguage(req.target);
  const targetName = lang?.english ?? req.target;
  const header = req.context?.title ? `Song: "${req.context.title}"${req.context.artist ? ` by ${req.context.artist}` : ""}\n` : "";
  const ctx = req.context?.lyrics ? `Full lyrics for context (do not translate this block):\n"""\n${req.context.lyrics.slice(0, 12_000)}\n"""\n\n` : "";
  const numbered = missing.map((l, i) => `${i + 1}. ${l}`).join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await openaiJSON<{ sourceLanguage?: string; translations?: unknown }>(
      TRANSLATE_SYSTEM(targetName),
      `${header}${ctx}Translate these ${missing.length} lines${attempt ? " (the array MUST have exactly " + missing.length + " entries)" : ""}:\n${numbered}`,
    );
    const arr = Array.isArray(out.translations) ? out.translations.map((x) => String(x ?? "")) : [];
    if (arr.length === missing.length) {
      return { translations: arr.map((t) => t.replace(/^\d+\.\s*/, "")), sourceLanguage: out.sourceLanguage?.toLowerCase() ?? null };
    }
  }
  throw new TranslationUnavailableError("The translation came back malformed. Please retry.", 502);
}

// ── DeepL ────────────────────────────────────────────────────

async function translateDeepL(req: TranslateRequest, missing: string[]) {
  const lang = getLanguage(req.target);
  if (!lang?.deepl) throw new TranslationUnavailableError(`DeepL does not support ${lang?.english ?? req.target}.`, 400);
  const key = env("DEEPL_API_KEY")!;
  const base = (env("DEEPL_API_URL") || (key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com")).replace(/\/$/, "");
  const deeplContext = [req.context?.title && `Song lyrics: "${req.context.title}" by ${req.context.artist ?? ""}`, req.context?.lyrics?.slice(0, 4000)]
    .filter(Boolean)
    .join("\n");
  const res = await fetch(`${base}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: missing,
      target_lang: lang.deepl,
      preserve_formatting: true,
      // context is not translated or billed; it improves idiomatic choices
      ...(deeplContext ? { context: deeplContext } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const msg =
      res.status === 456 ? "DeepL quota exceeded." : res.status === 429 ? "DeepL is rate-limiting. Retrying shortly." : res.status === 403 ? "DeepL API key rejected." : `DeepL responded ${res.status}`;
    throw new TranslationUnavailableError(msg, res.status === 429 ? 429 : 503);
  }
  const data = (await res.json()) as { translations: { detected_source_language: string; text: string }[] };
  const counts = new Map<string, number>();
  for (const t of data.translations) counts.set(t.detected_source_language, (counts.get(t.detected_source_language) ?? 0) + 1);
  const source = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.toLowerCase() ?? null;
  return { translations: data.translations.map((t) => t.text), sourceLanguage: source };
}

// ── Public API ───────────────────────────────────────────────

/** `charge` runs before the provider is called, with the number of uncached lines (may throw to deny). */
export async function translateLines(req: TranslateRequest, charge?: (lines: number) => Promise<void>): Promise<TranslateResponse> {
  const provider = activeProvider();
  if (provider === "none") throw new TranslationUnavailableError("No translation provider configured (set OPENAI_API_KEY or DEEPL_API_KEY).", 501);

  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const line of req.lines) {
    const hit = lineCache.get(`${provider}|${req.target}|${line}`);
    if (hit !== undefined) out[line] = hit;
    else missing.push(line);
  }

  let sourceLanguage = langCache.get(`${provider}|${ctxKey(req)}`) ?? null;
  if (missing.length) {
    await charge?.(missing.length);
    const r = provider === "openai" ? await translateOpenAI(req, missing) : await translateDeepL(req, missing);
    missing.forEach((line, i) => {
      out[line] = r.translations[i];
      lineCache.set(`${provider}|${req.target}|${line}`, r.translations[i]);
    });
    if (r.sourceLanguage) {
      sourceLanguage = r.sourceLanguage;
      langCache.set(`${provider}|${ctxKey(req)}`, r.sourceLanguage);
    }
  }
  return { translations: out, sourceLanguage, provider };
}

export async function explainLine(req: ExplainRequest, charge?: () => Promise<void>): Promise<Explanation> {
  if (!explanationsAvailable()) throw new TranslationUnavailableError("Line explanations require an OpenAI API key.", 501);
  const key = `${req.target}|${req.artist ?? ""}|${req.title ?? ""}|${req.line}`;
  const cached = explainCache.get(key);
  if (cached) return cached;
  await charge?.();

  const targetName = getLanguage(req.target)?.english ?? req.target;
  const system = `You explain song lyrics to a language learner. Write every explanation in ${targetName}.
Be concise and concrete. Do not repeat the full song lyrics.
Respond with JSON:
{"literal": "word-for-word meaning of the line",
 "natural": "the most natural ${targetName} rendering",
 "slang": [{"term": "slang or idiom exactly as in the line", "meaning": "what it means here"}],
 "cultural": "cultural or historical context, references, wordplay — empty string if none",
 "vocabulary": [{"term": "difficult word/expression exactly as in the line", "meaning": "${targetName} meaning"}]}`;
  const user = [
    req.title && `Song: "${req.title}"${req.artist ? ` by ${req.artist}` : ""}`,
    req.previous && `Previous line: ${req.previous}`,
    `Line: ${req.line}`,
    req.next && `Next line: ${req.next}`,
    req.translation && `Current translation: ${req.translation}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await openaiJSON<Partial<Explanation>>(system, user, 30_000);
  const arr = (x: unknown) =>
    Array.isArray(x) ? x.filter((i) => i && typeof i.term === "string").map((i) => ({ term: String(i.term), meaning: String(i.meaning ?? "") })) : [];
  const exp: Explanation = {
    literal: String(raw.literal ?? ""),
    natural: String(raw.natural ?? ""),
    slang: arr(raw.slang),
    cultural: String(raw.cultural ?? ""),
    vocabulary: arr(raw.vocabulary),
  };
  explainCache.set(key, exp);
  return exp;
}

// ── Pronunciation (romanization) ─────────────────────────────

const ROMAN_VERSION = "v2"; // bump to invalidate cached transliterations
const romanCache = new LruCache<string>(20_000, 1000 * 60 * 60 * 24 * 30);

const ROMANIZE_SYSTEM = `You write sing-along transliterations of song lyrics in the Latin alphabet.
Show how each line SOUNDS when sung — never translate. Keep words already in Latin script unchanged.
Exactly one output per input line, same order. Use the full lyrics for context and spell each recurring word identically throughout the song.

ARABIC (most important — be precise):
1. First decide which variety is sung — Levantine, Egyptian, Gulf/Khaleeji, Iraqi, Maghrebi, Sudanese or Modern Standard (fusha) — from vocabulary and spelling, and transliterate the way a native singer of that variety pronounces it, not letter by letter. Examples: Egyptian ج = g ("gamil"); Levantine/Egyptian urban ق = ' ("'albi"); Gulf ق = g ("galbi"); Gulf ك can be ch; colloquial ث → t/s and ذ → d/z where that is how it's said.
2. Write all the vowels you hear — Arabic script omits short vowels. Long vowels doubled: aa, ii, uu (ee/oo for dialect long e/o). Short vowels: a, i, u (e/o where the dialect has them).
3. Consonants, plain ASCII only (no diacritics, no Arabizi digits like 3/7/2): ع → ' · ء (hamza) → ' mid-word, nothing at the start · ح → h · خ → kh · غ → gh · ش → sh · ج → j (g in Egyptian) · ث → th · ذ → dh · ظ → dh/z · ص → s · ض → d · ط → t · ق → q in fusha, otherwise as pronounced · و → w (or uu/oo as vowel) · ي → y (or ii/ee as vowel).
4. Shadda (doubled consonant) → write the consonant twice: "habbeit", "ya rabb".
5. Definite article as sung, with sun-letter assimilation and a hyphen: el-'amar, esh-shams, en-nour (fusha: al-qamar, ash-shams).
6. Taa marbuta: -a / -e at the end, -it / -at before a following noun.
7. Common words in their familiar spelling when it matches the sound: habibi, ya, inta/enta, inti/enti, wallah, leil/layl.

OTHER SCRIPTS: Japanese → Hepburn with long vowels as ou/uu (not macrons); Korean → Revised Romanization, spaced by word; Chinese → pinyin with tone marks, spaced by word; Russian/Ukrainian/Greek/Hebrew/Persian/Hindi/Thai → simple standard transliteration, readable without special characters.

Respond with JSON: {"romanizations": ["...", ...]}`;

export const romanizationAvailable = () => !!env("OPENAI_API_KEY");

export async function romanizeLines(lines: string[], ctx: { title?: string; artist?: string; lyrics?: string }, charge?: (n: number) => Promise<void>) {
  if (!romanizationAvailable()) throw new TranslationUnavailableError("Pronunciation needs an OpenAI API key.", 501);
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const l of lines) {
    const hit = romanCache.get(`${ROMAN_VERSION}|${l}`);
    if (hit !== undefined) out[l] = hit;
    else missing.push(l);
  }
  if (!missing.length) return out;
  await charge?.(missing.length);
  const header = ctx.title ? `Song: "${ctx.title}"${ctx.artist ? ` by ${ctx.artist}` : ""}\n` : "";
  const context = ctx.lyrics ? `Full lyrics for context (do not output this block):\n"""\n${ctx.lyrics.slice(0, 8000)}\n"""\n\n` : "";
  const model = env("OPENAI_ROMANIZE_MODEL") || "gpt-4.1";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await openaiJSON<{ romanizations?: unknown }>(
      ROMANIZE_SYSTEM,
      `${header}${context}Transliterate these ${missing.length} lines${attempt ? ` (exactly ${missing.length} entries)` : ""}:\n${missing.map((l, i) => `${i + 1}. ${l}`).join("\n")}`,
      40_000,
      model,
    );
    const arr = Array.isArray(r.romanizations) ? r.romanizations.map((x) => String(x ?? "").replace(/^\d+\.\s*/, "")) : [];
    if (arr.length === missing.length) {
      missing.forEach((l, i) => {
        out[l] = arr[i];
        romanCache.set(`${ROMAN_VERSION}|${l}`, arr[i]);
      });
      return out;
    }
  }
  throw new TranslationUnavailableError("Pronunciation came back malformed. Please retry.", 502);
}
