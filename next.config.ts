import type { NextConfig } from "next";
import path from "node:path";
import { File as NodeFile, Blob as NodeBlob } from "node:buffer";

// next.config.ts is evaluated first in the build process, before Next collects
// page data. On some Node runtimes (Railway) the File/Blob globals aren't
// defined during that collection, which makes server-action modules throw
// "ReferenceError: File is not defined". Polyfill them here, up front.
const g = globalThis as { File?: unknown; Blob?: unknown };
if (typeof g.File === "undefined") g.File = NodeFile;
if (typeof g.Blob === "undefined") g.Blob = NodeBlob;

const nextConfig: NextConfig = {
  // Local verification builds can run while a dev server holds .next; point
  // them elsewhere with NEXT_DIST_DIR so the two never fight over one dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // This project has its own lockfile; pin the tracing root to silence the
  // "multiple lockfiles" workspace-root inference warning.
  outputFileTracingRoot: path.join(__dirname),
  // Keep these Node/CJS parsers external (not bundled) on the server. Bundling
  // pdf-parse in particular breaks it (it reads files relative to its package).
  serverExternalPackages: ["pdf-parse", "mammoth"],
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
