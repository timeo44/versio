import { NextResponse } from "next/server";
import { TranslationUnavailableError, romanizeLines } from "@/lib/server/translate";
import { HttpError, authenticate, consumeQuota } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { lines: string[], context?: { title, artist } } → { romanizations: Record<line, latin> } */
export async function POST(req: Request) {
  let user;
  try {
    user = await authenticate(req);
  } catch (e) {
    return errorResponse(e);
  }
  const body = (await req.json().catch(() => null)) as { lines?: unknown; context?: { title?: string; artist?: string } } | null;
  const lines = Array.isArray(body?.lines) ? body.lines.filter((l): l is string => typeof l === "string" && !!l.trim()).map((l) => l.slice(0, 500)) : [];
  if (!lines.length || lines.length > 80) return NextResponse.json({ error: "Send 1–80 lines per request." }, { status: 400 });
  try {
    const romanizations = await romanizeLines(lines, { title: body?.context?.title?.slice(0, 200), artist: body?.context?.artist?.slice(0, 200) }, (n) => consumeQuota(user, "translate", n));
    return NextResponse.json({ romanizations });
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    const status = e instanceof TranslationUnavailableError ? e.status : 503;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Pronunciation failed." }, { status });
  }
}
