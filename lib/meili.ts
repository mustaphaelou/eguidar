import { Meilisearch } from "meilisearch"

const globalForMeili = globalThis as unknown as { meili?: Meilisearch }

export function getMeiliSearch() {
  const host = process.env.MEILI_URL
  const apiKey = process.env.MEILI_MASTER_KEY
  if (!host) return null
  if (!globalForMeili.meili) {
    globalForMeili.meili = new Meilisearch({ host, apiKey })
  }
  return globalForMeili.meili
}
