// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"

import { NOM_COOKIE_MOYEN_DE_CONNEXION } from "@/lib/moyen-de-connexion"

import { renderHook } from "./test-utils"
import { useMoyenDeConnexion } from "./use-moyen-de-connexion"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.cookie = `${NOM_COOKIE_MOYEN_DE_CONNEXION}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
})

describe("la lecture du Moyen de connexion sur le client", () => {
  it("lit le cookie que le client Better Auth sait trouver", () => {
    document.cookie = `${NOM_COOKIE_MOYEN_DE_CONNEXION}=google; path=/`

    expect(renderHook(() => useMoyenDeConnexion()).current).toBe("google")
  })

  it("ne rend rien quand le cookie n'existe pas encore", () => {
    expect(renderHook(() => useMoyenDeConnexion()).current).toBeNull()
  })
})
