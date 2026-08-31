import { createClient } from "redis"

const globalForRedis = globalThis as unknown as {
  redis?: ReturnType<typeof createClient>
}

export function getRedis() {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!globalForRedis.redis) {
    globalForRedis.redis = createClient({ url })
  }
  return globalForRedis.redis
}
