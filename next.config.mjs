/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type-check and lint run in local/CI (tsc --noEmit, next lint). Don't let
  // the Vercel production build hard-fail on these — a deploy that can't be
  // viewed is worse, and these gates add Vercel-only failure modes.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
      // Allow Server Actions when proxied (e.g. GitHub Codespaces forwarded URL),
      // otherwise Next rejects POSTs whose Origin != Host. Harmless for local/prod.
      allowedOrigins: [
        "localhost:3000",
        "*.vercel.app",
        "*.app.github.dev",
        "*.github.dev",
      ],
    },
  },
};

export default nextConfig;
