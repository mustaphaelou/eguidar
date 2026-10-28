import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { register } from "./instrumentation"

const demarrerLesAutomations = vi.hoisted(() => vi.fn(async () => null))

vi.mock("@/lib/automations/file", () => ({ demarrerLesAutomations }))

describe("register", () => {
  let avertir: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    avertir = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    demarrerLesAutomations.mockClear()
  })

  it("avertit une seule fois au démarrage de production quand une clé manque", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "cle_turnstile_de_test")

    register()

    expect(avertir).toHaveBeenCalledTimes(1)
    expect(avertir.mock.calls[0][0]).toContain("RESEND_API_KEY")
    expect(avertir.mock.calls[0][0]).not.toContain("TURNSTILE_SECRET_KEY")
    expect(avertir.mock.calls[0][0]).not.toContain("cle_turnstile_de_test")
  })

  it("reste silencieux en développement", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "")

    register()

    expect(avertir).not.toHaveBeenCalled()
  })

  it("reste silencieux quand tout est configuré", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "re_cle_de_test")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "cle_turnstile_de_test")

    register()

    expect(avertir).not.toHaveBeenCalled()
  })

  it("ne démarre pas la boucle des automatisations sous Vitest", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "re_cle_de_test")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "cle_turnstile_de_test")

    register()
    await new Promise((resoudre) => setTimeout(resoudre, 0))

    expect(demarrerLesAutomations).not.toHaveBeenCalled()
  })
})
