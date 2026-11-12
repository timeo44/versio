import { NextResponse } from "next/server";
import { TranslationUnavailableError, translateLines } from "@/lib/server/translate";
import type { TranslateRequest } from "@/lib/translation/types";
import { getLanguage } from "@/lib/languages";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: TranslateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const lines = Array.isArray(body.lines) ? body.lines.filter((l) => typeof l === "string" && l.trim()).map((l) => l.slice(0, 500)) : [];
  if (!lines.length || lines.length > 80) return NextResponse.json({ error: "Send 1–80 lines per request." }, { status: 400 });
  if (!getLanguage(body.target)) return NextResponse.json({ error: "Unsupported target language." }, { status: 400 });

  try {
    const res = await translateLines({
      lines,
      target: body.target,
      context: {
        title: body.context?.title?.slice(0, 200),
        artist: body.context?.artist?.slice(0, 200),
        lyrics: body.context?.lyrics?.slice(0, 20_000),
      },
    });
    return NextResponse.json(res);
  } catch (e) {
    const status = e instanceof TranslationUnavailableError ? e.status : 503;
    const message = e instanceof Error && e.name !== "TimeoutError" ? e.message : "Translation timed out.";
    console.error("[translate]", message);
    return NextResponse.json({ error: message }, { status });
  }
}
