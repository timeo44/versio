export interface Language {
  /** ISO 639-1 (or BCP-47 for Chinese variants) */
  code: string;
  /** Native name shown in the UI */
  name: string;
  /** English name, used in LLM prompts */
  english: string;
  /** DeepL target code, undefined if DeepL does not support it as target */
  deepl?: string;
}

/** Featured first (the ones from the spec), then everything else. */
export const LANGUAGES: Language[] = [
  { code: "de", name: "Deutsch", english: "German", deepl: "DE" },
  { code: "en", name: "English", english: "English", deepl: "EN-US" },
  { code: "fr", name: "Français", english: "French", deepl: "FR" },
  { code: "it", name: "Italiano", english: "Italian", deepl: "IT" },
  { code: "es", name: "Español", english: "Spanish", deepl: "ES" },
  { code: "pt", name: "Português", english: "Portuguese (Brazil)", deepl: "PT-BR" },
  { code: "ja", name: "日本語", english: "Japanese", deepl: "JA" },
  { code: "ko", name: "한국어", english: "Korean", deepl: "KO" },
  { code: "ar", name: "العربية", english: "Arabic", deepl: "AR" },
  { code: "tr", name: "Türkçe", english: "Turkish", deepl: "TR" },
  { code: "nl", name: "Nederlands", english: "Dutch", deepl: "NL" },
  { code: "pl", name: "Polski", english: "Polish", deepl: "PL" },
  { code: "sv", name: "Svenska", english: "Swedish", deepl: "SV" },
  { code: "da", name: "Dansk", english: "Danish", deepl: "DA" },
  { code: "nb", name: "Norsk", english: "Norwegian (Bokmål)", deepl: "NB" },
  { code: "fi", name: "Suomi", english: "Finnish", deepl: "FI" },
  { code: "el", name: "Ελληνικά", english: "Greek", deepl: "EL" },
  { code: "cs", name: "Čeština", english: "Czech", deepl: "CS" },
  { code: "ro", name: "Română", english: "Romanian", deepl: "RO" },
  { code: "hu", name: "Magyar", english: "Hungarian", deepl: "HU" },
  { code: "uk", name: "Українська", english: "Ukrainian", deepl: "UK" },
  { code: "ru", name: "Русский", english: "Russian", deepl: "RU" },
  { code: "zh", name: "中文（简体）", english: "Chinese (Simplified)", deepl: "ZH-HANS" },
  { code: "id", name: "Bahasa Indonesia", english: "Indonesian", deepl: "ID" },
  { code: "hi", name: "हिन्दी", english: "Hindi" },
  { code: "he", name: "עברית", english: "Hebrew" },
  { code: "th", name: "ไทย", english: "Thai" },
  { code: "vi", name: "Tiếng Việt", english: "Vietnamese" },
  { code: "sq", name: "Shqip", english: "Albanian" },
  { code: "hr", name: "Hrvatski", english: "Croatian" },
  { code: "sr", name: "Srpski", english: "Serbian (Latin script)" },
];

export const FEATURED_COUNT = 10;
export const DEFAULT_TARGET = "de";

export function getLanguage(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function languagesForProvider(provider: string): Language[] {
  return provider === "deepl" ? LANGUAGES.filter((l) => l.deepl) : LANGUAGES;
}

const RTL = new Set(["ar", "he", "fa", "ur"]);
export const isRtl = (code?: string | null) => !!code && RTL.has(code.toLowerCase().slice(0, 2));

/** Human-readable name for a detected source language code (e.g. "ES" or "es"). */
export function languageLabel(code?: string | null): string {
  if (!code) return "";
  const c = code.toLowerCase().split("-")[0];
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(c) ?? c.toUpperCase();
  } catch {
    return c.toUpperCase();
  }
}
