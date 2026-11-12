import { NextResponse } from "next/server";
import { rest, spotifyUserFromRequest, supabaseEnabled } from "@/lib/server/supabase";
import type { VocabEntry } from "@/lib/vocabulary/types";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  term: string;
  meaning: string;
  line: string;
  translation: string | null;
  track_name: string;
  artist_name: string;
  target_lang: string;
  created_at: string;
}

const toEntry = (r: Row): VocabEntry => ({
  id: r.id,
  term: r.term,
  meaning: r.meaning,
  line: r.line,
  translation: r.translation ?? undefined,
  trackName: r.track_name,
  artistName: r.artist_name,
  targetLang: r.target_lang,
  createdAt: r.created_at,
});

async function guard(req: Request) {
  if (!supabaseEnabled()) return { error: NextResponse.json({ error: "Vocabulary sync is not configured." }, { status: 501 }) };
  const user = await spotifyUserFromRequest(req);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { user };
}

export async function GET(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  try {
    const rows = (await rest(`vocabulary?spotify_user_id=eq.${encodeURIComponent(g.user)}&order=created_at.desc&limit=1000`)) as Row[];
    return NextResponse.json(rows.map(toEntry));
  } catch (e) {
    console.error("[vocabulary]", e);
    return NextResponse.json({ error: "Vocabulary storage unavailable." }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const b = (await req.json().catch(() => null)) as Partial<VocabEntry> | null;
  if (!b?.term) return NextResponse.json({ error: "term is required" }, { status: 400 });
  const s = (v: unknown, n = 500) => String(v ?? "").slice(0, n);
  try {
    const rows = (await rest("vocabulary", {
      method: "POST",
      body: JSON.stringify({
        ...(b.id && /^[0-9a-f-]{36}$/i.test(b.id) ? { id: b.id } : {}),
        spotify_user_id: g.user,
        term: s(b.term, 200),
        meaning: s(b.meaning, 1000),
        line: s(b.line),
        translation: b.translation ? s(b.translation) : null,
        track_name: s(b.trackName, 200),
        artist_name: s(b.artistName, 200),
        target_lang: s(b.targetLang, 10),
      }),
    })) as Row[];
    return NextResponse.json(toEntry(rows[0]));
  } catch (e) {
    console.error("[vocabulary]", e);
    return NextResponse.json({ error: "Could not save." }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await rest(`vocabulary?id=eq.${id}&spotify_user_id=eq.${encodeURIComponent(g.user)}`, { method: "DELETE" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[vocabulary]", e);
    return NextResponse.json({ error: "Could not delete." }, { status: 502 });
  }
}
