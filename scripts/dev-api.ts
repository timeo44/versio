/**
 * Local API server for development — runs the same handler as the Supabase
 * Edge Function. Started automatically by `npm run dev` on port 8787.
 */
import { createServer } from "node:http";
import { handle } from "../lib/server/handler";

const PORT = Number(process.env.API_PORT ?? 8787);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
  const response = await handle(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, "127.0.0.1", () => console.log(`▸ Versio API on http://127.0.0.1:${PORT}`));
