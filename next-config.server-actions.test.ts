import { createRequire } from "node:module"

import { beforeAll, describe, expect, it } from "vitest"

import { LIMITE_OCTETS_IMPORT } from "@/lib/import-produits"

interface ConfigurationLue {
  experimental?: {
    serverActions?: {
      bodySizeLimit?: string | number
    }
  }
}

let configuration: ConfigurationLue

beforeAll(async () => {
  globalThis.require = createRequire(import.meta.url)
  configuration = (await import("@/next.config")).default
})

describe("serverActions.bodySizeLimit", () => {
  it("laisse passer un fichier de 5 Mo plus l'enveloppe multipart", () => {
    expect(configuration.experimental?.serverActions?.bodySizeLimit).toBe("6mb")
  })

  it("reste au-dessus de la limite du contrat du fichier", () => {
    expect(6 * 1024 * 1024).toBeGreaterThan(LIMITE_OCTETS_IMPORT)
  })
})
