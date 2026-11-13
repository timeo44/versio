// Source entry for the Supabase Edge Function. `npm run build:function`
// bundles this (and everything it imports) into
// supabase/functions/versio-api/index.ts, which is what gets deployed.
import { handle } from "../../lib/server/handler";

declare const Deno: { serve(handler: (req: Request) => Response | Promise<Response>): unknown };

Deno.serve(handle);
