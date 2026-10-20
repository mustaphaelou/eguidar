import type { NextConfig } from "next"

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://challenges.cloudflare.com",
  ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
]

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://cdn.eguidar.com",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com https://*.r2.cloudflarestorage.com",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ]
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
