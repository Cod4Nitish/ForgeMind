import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so a stray lockfile in a parent directory is never
  // picked up as the workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
