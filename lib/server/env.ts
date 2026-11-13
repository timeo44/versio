/** Reads an environment variable in Node (local dev, tests) and Deno (Supabase Edge Functions). */
export function env(key: string): string | undefined {
  const g = globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } }; process?: { env: Record<string, string | undefined> } };
  const v = g.Deno ? g.Deno.env.get(key) : g.process?.env?.[key];
  return v === "" ? undefined : v;
}
