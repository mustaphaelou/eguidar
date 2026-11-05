import { createClient } from "redis"

/**
 * Le cache applicatif de la sonde : une base Redis dédiée, vidée avant le
 * démarrage du serveur. Le handler lit `REDIS_URL` tel quel, donc l'index de
 * base suffit à isoler la sonde du cache de `next dev` : jamais l'index 0,
 * jamais la vidange de toutes les bases.
 */

export const INDEX_DE_LA_SONDE = 1

/** La seule commande de vidage que la sonde a le droit d'envoyer. */
export const COMMANDE_DE_VIDAGE = "FLUSHDB"

export function indiceDeBaseRedis(source: string): number {
  const url = new URL(source)
  const segment = url.pathname.replace(/^\/+/, "").split("/")[0] ?? ""
  if (segment === "") return 0
  const indice = Number(segment)
  if (!Number.isInteger(indice) || indice < 0) {
    throw new Error(
      `l'index de la base Redis de la sonde est illisible (${source})`
    )
  }
  return indice
}

export function validerRedisDeSonde(source: string): string {
  const indice = indiceDeBaseRedis(source)
  if (indice === 0) {
    throw new Error(
      `la sonde refuse l'index 0 du cache Redis : elle vide sa base avant le serveur, et l'index 0 est celui du développement. Donnez E2E_REDIS_URL avec un index dédié.`
    )
  }
  return source
}

/** Remplace l'index de la base par celui de la sonde, sans toucher au reste. */
export function deriverRedisDeSonde(source: string): string {
  const url = new URL(source)
  url.pathname = `/${INDEX_DE_LA_SONDE}`
  return url.toString()
}

/**
 * L'URL Redis de la sonde : `E2E_REDIS_URL` si elle est déclarée, sinon
 * l'index 1 dérivé de `REDIS_URL`. Aucune des deux : la sonde tourne sans
 * cache, et le dit.
 */
export function resoudreRedisDeSonde(
  environnement: Partial<NodeJS.ProcessEnv> = process.env
): string | null {
  const explicite = environnement.E2E_REDIS_URL?.trim()
  if (explicite) return validerRedisDeSonde(explicite)
  const source = environnement.REDIS_URL?.trim()
  if (!source) return null
  return validerRedisDeSonde(deriverRedisDeSonde(source))
}

/** Vide la base de la sonde, et seulement elle. */
export async function viderLaBaseRedis(url: string): Promise<void> {
  if (indiceDeBaseRedis(url) === 0) {
    throw new Error(
      "la sonde refuse de vider l'index 0 du cache Redis, et ne vide jamais toutes les bases"
    )
  }
  const client = createClient({ url })
  client.on("error", () => {})
  await client.connect()
  try {
    await client.flushDb()
  } finally {
    await client.quit()
  }
}

/** L'URL Redis sans son secret, pour les journaux de la sonde. */
export function afficherRedis(url: string): string {
  const sansSecret = new URL(url)
  if (sansSecret.password) sansSecret.password = "***"
  return sansSecret.toString()
}
