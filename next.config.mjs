/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
      // Allow Server Actions when proxied (e.g. GitHub Codespaces forwarded URL),
      // otherwise Next rejects POSTs whose Origin != Host. Harmless for local/prod.
      allowedOrigins: ["localhost:3000", "*.app.github.dev", "*.github.dev"],
    },
  },
};

export default nextConfig;
