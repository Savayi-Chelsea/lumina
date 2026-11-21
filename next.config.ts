import type { NextConfig } from "next";

// Extra hosts allowed to invoke Server Actions, as a comma-separated list of
// hosts (for example "localhost:3000"). Needed behind proxies that rewrite the
// browser's Origin header, such as GitHub Codespaces port forwarding: the proxy
// forwards the public host in x-forwarded-host but rewrites a same-site Origin to
// http://localhost:<port>, so Next.js would otherwise reject every action.
// Leave unset in production unless a proxy in front of the app does the same.
const serverActionOrigins = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS || "")
  .split(",").map(host => host.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  // Hide the development-only route/compile badge; build errors are still shown.
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.googleusercontent.com" }],
  },
  ...(serverActionOrigins.length ? { experimental: { serverActions: { allowedOrigins: serverActionOrigins } } } : {}),
};

export default nextConfig;
