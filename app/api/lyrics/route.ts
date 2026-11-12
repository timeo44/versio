import { NextResponse } from "next/server";
import { findLyrics } from "@/lib/server/lrclib";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const track = searchParams.get("track")?.trim();
  const artist = searchParams.get("artist")?.trim();
  const album = searchParams.get("album")?.trim() || undefined;
  const duration = Number(searchParams.get("duration")) || undefined;

  if (!track || !artist) {
    return NextResponse.json({ error: "track and artist are required" }, { status: 400 });
  }
  try {
    const result = await findLyrics({ track, artist, album, durationMs: duration });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.error("[lyrics]", e);
    return NextResponse.json({ error: "Lyrics provider is unavailable right now." }, { status: 502 });
  }
}
