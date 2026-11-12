export interface TranslateRequest {
  /** Unique line texts to translate */
  lines: string[];
  /** Target language code from lib/languages */
  target: string;
  context?: {
    title?: string;
    artist?: string;
    /** Full lyrics, gives the model song-level context */
    lyrics?: string;
  };
}

export interface TranslateResponse {
  /** original text → translation */
  translations: Record<string, string>;
  /** ISO 639-1 code of the detected source language, if known */
  sourceLanguage: string | null;
  provider: "openai" | "deepl";
}

export interface ExplainRequest {
  line: string;
  translation?: string;
  previous?: string;
  next?: string;
  target: string;
  title?: string;
  artist?: string;
}

export interface Explanation {
  literal: string;
  natural: string;
  slang: { term: string; meaning: string }[];
  cultural: string;
  vocabulary: { term: string; meaning: string }[];
}

export type ProviderName = "openai" | "deepl" | "none";
