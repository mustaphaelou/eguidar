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

export type ClientRedis = ReturnType<typeof creerClientRedis>

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

/**
 * Le geste partagé par les deux usages de Redis : rendre un client ouvert, ou
 * `null` quand le magasin n'est pas configuré ou qu'une connexion concurrente
 * a déjà pris la main. Une rejection de `connect` vaut « indisponible » : les
 * appelants la traitent déjà comme telle.
 */
export async function clientRedisPret(
  obtenirClient: () => ClientRedis | null = getRedis
): Promise<ClientRedis | null> {
  const redis = obtenirClient()
  if (!redis) return null
  try {
    if (!redis.isOpen) await redis.connect()
  } catch {
    // Une autre requête a pu ouvrir la connexion entre-temps.
  }
  return redis.isOpen ? redis : null
}
