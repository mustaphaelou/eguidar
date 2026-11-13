import { createClient } from "redis"

import { estTagDeDetail } from "./prefixes-detail.js"

const MAX_TTL_SECONDS = 30 * 24 * 60 * 60
const TAG_KEY_PREFIX = "eguidar:cache:tag:"
const TAGS_SET_KEY = "eguidar:cache:revalidated-tags"
const BUDGET_DETAIL_KEY = "eguidar:cache:detail-budget"

export const DETAIL_KEYS_MAX_DEFAULT = 10_000

let clientPromise = null

function plafondDetail() {
  const brut = process.env.CACHE_DETAIL_KEYS_MAX
  if (typeof brut !== "string" || brut.trim() === "") {
    return DETAIL_KEYS_MAX_DEFAULT
  }
  const valeur = Number(brut)
  if (!Number.isFinite(valeur) || valeur <= 0) return DETAIL_KEYS_MAX_DEFAULT
  return Math.floor(valeur)
}

function estEntreeDeDetail(tags) {
  return Array.isArray(tags) && tags.some(estTagDeDetail)
}

/**
 * Best-effort : rend vrai quand le budget est plein ; le membre de l'écriture
 * courante est alors retiré. Une panne Redis rend faux pour que l'entrée
 * s'écrive comme avant.
 */
async function budgetRefuse(client, cacheKey, ttl) {
  const maintenant = Date.now()
  try {
    await client.zAdd(BUDGET_DETAIL_KEY, {
      score: maintenant + ttl * 1000,
      value: cacheKey,
    })
    await client.zRemRangeByScore(BUDGET_DETAIL_KEY, "-inf", maintenant)
    const admises = await client.zCard(BUDGET_DETAIL_KEY)
    if (admises <= plafondDetail()) return false
  } catch {
    return false
  }
  try {
    await client.zRem(BUDGET_DETAIL_KEY, cacheKey)
  } catch {
  }
  return true
}

function getClient() {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!clientPromise) {
    const client = createClient({
      url,
      socket: { connectTimeout: 2000 },
      disableOfflineQueue: true,
    })
    client.on("error", () => {})
    clientPromise = client.connect().then(
      () => client,
      () => client
    )
  }
  return clientPromise
}

const pendingSets = new Map()

const tagManifest = new Map()

function isTagsExpired(tags, timestamp) {
  const now = Date.now()
  for (const tag of tags) {
    const entry = tagManifest.get(tag)
    const expiredAt = entry == null ? undefined : entry.expired
    if (typeof expiredAt === "number" && expiredAt <= now && expiredAt > timestamp) {
      return true
    }
  }
  return false
}

function isTagsStale(tags, timestamp) {
  for (const tag of tags) {
    const staleAt = (tagManifest.get(tag) || {}).stale ?? 0
    if (typeof staleAt === "number" && staleAt > timestamp) return true
  }
  return false
}

const redisHandler = {
  async get(cacheKey, softTags) {
    const pending = pendingSets.get(cacheKey)
    if (pending) await pending

    const url = process.env.REDIS_URL
    if (!url) return undefined
    try {
      const client = await getClient()
      const stored = await client.get(cacheKey)
      if (!stored) return undefined

      const data = JSON.parse(stored)
      const entry = {
        value: new ReadableStream({
          start(controller) {
            controller.enqueue(Buffer.from(data.value, "base64"))
            controller.close()
          },
        }),
        tags: Array.isArray(data.tags) ? data.tags : [],
        stale: data.stale ?? 0,
        timestamp: data.timestamp ?? 0,
        expire: data.expire ?? 0,
        revalidate: data.revalidate ?? 0,
      }

      const now = Date.now()
      if (now > entry.timestamp + entry.revalidate * 1000) return undefined
      if (isTagsExpired(entry.tags, entry.timestamp)) return undefined

      let revalidate = entry.revalidate
      if (isTagsStale(entry.tags, entry.timestamp)) revalidate = -1

      if (softTags && (isTagsExpired(softTags, entry.timestamp) || isTagsStale(softTags, entry.timestamp))) {
        revalidate = -1
      }

      return { ...entry, revalidate }
    } catch {
      return undefined
    }
  },

  async set(cacheKey, pendingEntry) {
    const url = process.env.REDIS_URL
    if (!url) return
    let resolvePending
    const pendingPromise = new Promise((resolve) => {
      resolvePending = resolve
    })
    pendingSets.set(cacheKey, pendingPromise)
    try {
      const entry = await pendingEntry

      const client = await getClient()
      const [kept, toStore] = entry.value.tee()
      entry.value = kept
      const reader = toStore.getReader()
      const chunks = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      reader.releaseLock()

      const payload = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
      const ttl = Math.max(
        1,
        Math.min(entry.expire ?? MAX_TTL_SECONDS, MAX_TTL_SECONDS)
      )
      if (
        estEntreeDeDetail(entry.tags) &&
        (await budgetRefuse(client, cacheKey, ttl))
      ) {
        return
      }
      await client.set(
        cacheKey,
        JSON.stringify({
          value: payload.toString("base64"),
          tags: entry.tags,
          stale: entry.stale,
          timestamp: entry.timestamp,
          expire: entry.expire,
          revalidate: entry.revalidate,
        }),
        { EX: ttl }
      )
    } catch {
    } finally {
      resolvePending()
      pendingSets.delete(cacheKey)
    }
  },

  async refreshTags() {
    const url = process.env.REDIS_URL
    if (!url) return
    try {
      const client = await getClient()
      const tagNames = await client.sMembers(TAGS_SET_KEY)
      if (tagNames.length === 0) return
      const values = await client.mGet(tagNames.map((name) => TAG_KEY_PREFIX + name))
      for (let i = 0; i < tagNames.length; i++) {
        if (!values[i]) continue
        try {
          tagManifest.set(tagNames[i], JSON.parse(values[i]))
        } catch {
        }
      }
    } catch {
    }
  },

  async getExpiration(tags) {
    const expirations = tags.map((tag) => {
      const entry = tagManifest.get(tag)
      if (!entry) return 0
      return entry.expired || 0
    })
    return Math.max(...expirations, 0)
  },

  async updateTags(tags, durations) {
    const now = Date.now()
    for (const tag of tags) {
      const existing = tagManifest.get(tag) || {}
      if (durations) {
        existing.stale = now
        if (durations.expire !== undefined) {
          existing.expired = now + durations.expire * 1000
        }
      } else {
        existing.expired = now
      }
      tagManifest.set(tag, existing)
    }

    const url = process.env.REDIS_URL
    if (!url) return
    try {
      const client = await getClient()
      const pipeline = client.multi()
      for (const tag of tags) {
        pipeline.set(TAG_KEY_PREFIX + tag, JSON.stringify(tagManifest.get(tag)))
        pipeline.sAdd(TAGS_SET_KEY, tag)
      }
      await pipeline.exec()
    } catch {
    }
  },
}

export default redisHandler
