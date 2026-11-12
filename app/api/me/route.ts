import { NextResponse } from "next/server";
import { accessInfo, authenticate, redeemInvite } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/http";
import { supabaseEnabled } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Who am I, am I allowed in, what are my limits. */
export async function GET(req: Request) {
  try {
    const u = await authenticate(req, { allowInactive: true });
    return NextResponse.json(await accessInfo(u));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Redeem an invite code: { invite: "code" } */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { invite?: string };
    const u = await authenticate(req, { allowInactive: true });
    if (supabaseEnabled() && typeof body.invite === "string" && body.invite.trim()) {
      await redeemInvite(u.profile, body.invite.trim().slice(0, 64));
    }
    return NextResponse.json(await accessInfo(await authenticate(req, { allowInactive: true })));
  } catch (e) {
    return errorResponse(e);
  }
}
