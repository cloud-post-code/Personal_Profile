import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This project has its own lockfile; pin the tracing root to silence the
  // "multiple lockfiles" workspace-root inference warning.
  outputFileTracingRoot: path.join(__dirname),
  // Allow serving uploaded images from the local/Railway volume path.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Uploaded files live outside /public on Railway's volume; served via API route.
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
