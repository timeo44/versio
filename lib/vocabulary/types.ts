export interface VocabEntry {
  id: string;
  term: string;
  meaning: string;
  /** Original lyric line for context */
  line: string;
  /** Translation of that line, if available */
  translation?: string;
  trackName: string;
  artistName: string;
  targetLang: string;
  createdAt: string;
}
