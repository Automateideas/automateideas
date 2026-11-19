import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  // The dev-only "N" badge sat on top of the sidebar's Log out link.
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  // Security headers on every response (Stage 15 review).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Don't guess file types (e.g. treat an uploaded image as a script).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Other sites may not show these pages in a frame (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          // Links to other sites get only our origin, never full paths (share links stay private).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Browsers only honour this over HTTPS: keep using HTTPS for two years.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
