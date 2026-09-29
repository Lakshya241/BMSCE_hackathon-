import type { NextConfig } from "next";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
const VISION = process.env.NEXT_PUBLIC_VISION_URL || "http://localhost:5001";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    return [
      { source: "/backend/api/:path*", destination: `${BACKEND}/api/:path*` },
      // Python OpenCV vision service (MJPEG stream + analyze JSON)
      { source: "/backend/vision/:path*", destination: `${VISION}/:path*` },
    ];
  },
};

export default nextConfig;
