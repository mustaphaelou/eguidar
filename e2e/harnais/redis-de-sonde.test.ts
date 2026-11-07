import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  COMMANDE_DE_VIDAGE,
  indiceDeBaseRedis,
  resoudreRedisDeSonde,
  validerRedisDeSonde,
} from "./redis-de-sonde"

const SOURCE = readFileSync(
  new URL("./redis-de-sonde.ts", import.meta.url),
  "utf8"
)

describe("le cache applicatif de la sonde", () => {
  it("dérive l'index 1 de la base Redis du poste, pour ne pas partager l'index 0", () => {
    expect(resoudreRedisDeSonde({ REDIS_URL: "redis://127.0.0.1:6379" })).toBe(
      "redis://127.0.0.1:6379/1"
    )
    expect(
      resoudreRedisDeSonde({ REDIS_URL: "redis://:secret@redis:6380/0" })
    ).toBe("redis://:secret@redis:6380/1")
  })

  it("prend la base annoncée par `E2E_REDIS_URL` quand elle est dédiée", () => {
    expect(
      resoudreRedisDeSonde({ E2E_REDIS_URL: "redis://127.0.0.1:6379/2" })
    ).toBe("redis://127.0.0.1:6379/2")
  })

  it("refuse l'index 0, celui du développement", () => {
    expect(() =>
      resoudreRedisDeSonde({ E2E_REDIS_URL: "redis://127.0.0.1:6379/0" })
    ).toThrow(/index 0|base 0|refuse/i)
    expect(() => validerRedisDeSonde("redis://127.0.0.1:6379")).toThrow(
      /index 0|base 0|refuse/i
    )
  })

  it("fonctionne sans Redis quand aucune URL n'est déclarée, et le dit", () => {
    expect(resoudreRedisDeSonde({})).toBeNull()
  })

  it("vide une seule base, jamais toutes", () => {
    expect(COMMANDE_DE_VIDAGE).toBe("FLUSHDB")
    expect(SOURCE).not.toMatch(/FLUSHALL/i)
    expect(indiceDeBaseRedis("redis://127.0.0.1:6379/1")).toBe(1)
    expect(() => validerRedisDeSonde("redis://127.0.0.1:6379/0")).toThrow()
  })

  it("lit l'index d'une URL Redis, et refuse un index illisible", () => {
    expect(indiceDeBaseRedis("redis://127.0.0.1:6379/3")).toBe(3)
    expect(() => indiceDeBaseRedis("redis://127.0.0.1:6379/abc")).toThrow(
      /index/i
    )
  })
})
