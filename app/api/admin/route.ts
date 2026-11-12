import { NextResponse } from "next/server";
import { HttpError, adminDeleteInvite, adminDeleteUser, adminOverview, adminUpdateUser, createInvite, requireAdmin, sanitizeLimits, setDefaultLimits } from "@/lib/server/access";
import { errorResponse } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    return NextResponse.json(await adminOverview());
  } catch (e) {
    return errorResponse(e);
  }
}

type Action =
  | { action: "invite"; email: string; name?: string }
  | { action: "deleteInvite"; code: string }
  | { action: "updateUser"; spotifyId: string; status?: string; role?: string; limits?: Record<string, number> | null; email?: string | null }
  | { action: "deleteUser"; spotifyId: string }
  | { action: "setDefaults"; limits: Record<string, number | null> };

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    const body = (await req.json().catch(() => null)) as Action | null;
    if (!body?.action) throw new HttpError(400, "bad_request", "Missing action.");
    const me = admin.profile.id;

    switch (body.action) {
      case "invite":
        return NextResponse.json({ invite: await createInvite(String(body.email ?? ""), body.name ?? null, me) });
      case "deleteInvite":
        await adminDeleteInvite(String(body.code));
        break;
      case "updateUser":
        await adminUpdateUser(me, String(body.spotifyId), body);
        break;
      case "deleteUser":
        await adminDeleteUser(me, String(body.spotifyId));
        break;
      case "setDefaults":
        await setDefaultLimits(sanitizeLimits(body.limits ?? {}));
        break;
      default:
        throw new HttpError(400, "bad_request", "Unknown action.");
    }
    return NextResponse.json(await adminOverview());
  } catch (e) {
    return errorResponse(e);
  }
}
