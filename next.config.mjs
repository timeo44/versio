/**
 * Static export for GitHub Pages. All server logic lives in the Supabase
 * Edge Function (lib/server → supabase/functions/versio-api).
 * @type {import('next').NextConfig}
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

const nextConfig = {
  output: "export",
  basePath: basePath || undefined,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};
export default nextConfig;
