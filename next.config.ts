import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  cacheHandlers: {
    remote: require.resolve("./cache-handlers/redis-handler.js"),
  },
}

export default nextConfig
