import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    remote: require.resolve("./cache-handlers/redis-handler.js"),
  },
}

export default nextConfig
