import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the development-only route/compile badge; build errors are still shown.
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.googleusercontent.com" }],
  },
};

export default nextConfig;
