import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Explicit gzip/brotli compression for list payloads (default on, pinned).
  compress: true,
  // Server-action uploads (PPMP / asset / catalog Excel imports accept up
  // to 10 MB files) exceed the 1 MB default action payload limit.
  experimental: {
    serverActions: {
      // Includes multipart overhead on top of the 10 MB file itself; a file at
      // the cap would otherwise fail the action with a bare "Failed to fetch".
      bodySizeLimit: "12mb",
    },
    // Next 16 buffers request bodies for the proxy/middleware so both it and
    // the route handler can read them. The default 10 MB truncates larger
    // workbook uploads (which then look like corrupted files), so keep this
    // above the 10 MB import cap plus multipart overhead.
    proxyClientMaxBodySize: "12mb",
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
