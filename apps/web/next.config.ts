import type { NextConfig } from "next";
import path from "path";

const repoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["backend"],
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
