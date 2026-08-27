import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Per POSTYAR spec §104: NEVER ignoreBuildErrors. Surface real type
  // errors instead of suppressing them.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
