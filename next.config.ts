import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  cacheHandlers: {
    remote: require.resolve("./cache-handlers/redis-handler.js"),
  },
  async redirects() {
    return [
      {
        source: "/request-password-reset",
        destination: "/mot-de-passe-oublie",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
