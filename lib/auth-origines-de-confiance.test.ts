import { describe, expect, it, vi } from "vitest"

import { auth } from "@/lib/auth"
import { ORIGINES_DE_LA_BOUTIQUE } from "@/lib/origines-de-confiance"

describe("origines de confiance de l'authentification", () => {
  it("déclare l'apex et www dans les options", () => {
    expect(auth.options.trustedOrigins).toEqual(
      expect.arrayContaining([...ORIGINES_DE_LA_BOUTIQUE])
    )
  })

  it("ajoute l'origine de prévisualisation déclarée par le déploiement", async () => {
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://preview.example")
    vi.resetModules()

    const { auth: freshAuth } = await import("@/lib/auth")

    expect(freshAuth.options.trustedOrigins).toEqual([
      ...ORIGINES_DE_LA_BOUTIQUE,
      "https://preview.example",
    ])

    vi.unstubAllEnvs()
  })
})
