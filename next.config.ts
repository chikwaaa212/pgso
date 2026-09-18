import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
};

export default nextConfig;
