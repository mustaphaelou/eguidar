import { createClient } from "redis"

function creerClientRedis(url: string) {
  return createClient({
    url,
    socket: {
      connectTimeout: 1_000,
      reconnectStrategy: (retries) => (retries > 1 ? false : 100),
    },
  })
}

type ClientRedis = ReturnType<typeof creerClientRedis>

const globalForRedis = globalThis as unknown as {
  redis?: ClientRedis
}

export function getRedis(): ClientRedis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!globalForRedis.redis) {
    const redis = creerClientRedis(url)
    redis.on("error", () => {})
    globalForRedis.redis = redis
  }
  return globalForRedis.redis
}
