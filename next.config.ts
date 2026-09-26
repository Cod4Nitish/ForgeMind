import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so a stray lockfile in a parent directory is never
  // picked up as the workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
  // The Swytchcode runtime spawns the Swytchcode CLI; load it with native
  // Node `require` instead of bundling it into the server build.
  serverExternalPackages: ["@swytchcode/runtime"],
};

export default nextConfig;
