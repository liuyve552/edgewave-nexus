import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ESA Pages currently supports Next.js as static assets (SSG/export).
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
