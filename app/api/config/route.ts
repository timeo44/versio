import { NextResponse } from "next/server";
import { activeProvider, explanationsAvailable, romanizationAvailable } from "@/lib/server/translate";
import { supabaseEnabled } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Tells the client which server features are configured. No secrets. */
export function GET() {
  return NextResponse.json({
    provider: activeProvider(),
    explanations: explanationsAvailable(),
    pronunciation: romanizationAvailable(),
    vocabularySync: supabaseEnabled(),
  });
}
