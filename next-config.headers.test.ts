import { createRequire } from "node:module"

import { beforeAll, describe, expect, it } from "vitest"

type Entete = { key: string; value: string }
type Regle = { source: string; headers: Entete[] }

let regles: Regle[] = []

beforeAll(async () => {
  globalThis.require = createRequire(import.meta.url)
  const { default: nextConfig } = await import("@/next.config")
  regles = ((await nextConfig.headers?.()) ?? []) as Regle[]
})

function enTetes(): Map<string, string> {
  expect(regles).toHaveLength(1)
  const [regle] = regles
  expect(regle.source).toBe("/(.*)")
  return new Map(regle.headers.map(({ key, value }) => [key, value]))
}

function politique(): Record<string, string[]> {
  const csp = enTetes().get("Content-Security-Policy")
  expect(csp, "la CSP est envoyée avec chaque réponse").toBeDefined()
  return Object.fromEntries(
    csp!
      .split(";")
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [nom, ...sources] = directive.split(/\s+/)
        return [nom, sources]
      })
  )
}

describe("headers : les en-têtes de sécurité partent de la configuration du site", () => {
  it("une seule règle couvre toutes les routes", () => {
    enTetes()
  })

  it("envoie X-Frame-Options, X-Content-Type-Options et Referrer-Policy", () => {
    const entetes = enTetes()
    expect(entetes.get("X-Frame-Options")).toBe("DENY")
    expect(entetes.get("X-Content-Type-Options")).toBe("nosniff")
    expect(entetes.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    )
  })

  it("laisse HSTS au bord qui termine le TLS", () => {
    expect([...enTetes().keys()]).not.toContain("Strict-Transport-Security")
  })

  it("part de default-src 'self' et ferme les surfaces d'injection", () => {
    expect(politique()).toEqual({
      "default-src": ["'self'"],
      "script-src": [
        "'self'",
        "'unsafe-inline'",
        "https://challenges.cloudflare.com",
      ],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "https://cdn.eguidar.com"],
      "font-src": ["'self'"],
      "connect-src": [
        "'self'",
        "https://challenges.cloudflare.com",
        "https://*.r2.cloudflarestorage.com",
      ],
      "frame-src": ["https://challenges.cloudflare.com"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
    })
  })

  it("n'autorise aucun script évalué en production", () => {
    expect(politique()["script-src"]).not.toContain("'unsafe-eval'")
  })
})
