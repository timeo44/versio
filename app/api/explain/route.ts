import { NextResponse } from "next/server";
import { TranslationUnavailableError, explainLine } from "@/lib/server/translate";
import { HttpError, authenticate, consumeQuota } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/http";
import type { ExplainRequest } from "@/lib/translation/types";
import { getLanguage } from "@/lib/languages";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let user;
  try {
    user = await authenticate(req);
  } catch (e) {
    return errorResponse(e);
  }
  const body = (await req.json().catch(() => null)) as ExplainRequest | null;
  if (!body?.line || typeof body.line !== "string" || !getLanguage(body.target)) {
    return NextResponse.json({ error: "line and a supported target are required" }, { status: 400 });
  }
  const s = (v?: string) => (typeof v === "string" ? v.slice(0, 500) : undefined);
  try {
    const exp = await explainLine(
      {
        line: body.line.slice(0, 500),
        translation: s(body.translation),
        previous: s(body.previous),
        next: s(body.next),
        target: body.target,
        title: s(body.title),
        artist: s(body.artist),
      },
      () => consumeQuota(user, "explain", 1),
    );
    return NextResponse.json(exp);
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    const status = e instanceof TranslationUnavailableError ? e.status : 503;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Explanation failed." }, { status });
  }
}
