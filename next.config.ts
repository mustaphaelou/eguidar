import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: false,
  },
  output: "standalone",
  cacheComponents: true,
  cacheHandlers: {
    remote: require.resolve("./cache-handlers/redis-handler.js"),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.eguidar.com",
        pathname: "/**",
        search: "",
      },
    ],
    qualities: [75],
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
