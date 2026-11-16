import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Explicit gzip/brotli compression for list payloads (default on, pinned).
  compress: true,
  // Server-action uploads (PPMP / asset / catalog Excel imports accept up
  // to 10 MB files) exceed the 1 MB default action payload limit.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  // The stock ledger moved from /inventory to /stocks in both portals.
  // Keep old links (bookmarks, printed QR labels, cached emails) working.
  async redirects() {
    return [
      { source: "/personnel/inventory", destination: "/personnel/stocks", permanent: true },
      { source: "/super-admin/inventory", destination: "/super-admin/stocks", permanent: true },
    ];
  },
};

export default nextConfig;
