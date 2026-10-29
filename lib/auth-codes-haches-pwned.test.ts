import { describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"

interface PluginObserve {
  id: string
  options?: { storeOTP?: string }
}

function plugins(): PluginObserve[] {
  return (auth.options.plugins ?? []) as unknown as PluginObserve[]
}

describe("Authentification : les secrets au repos", () => {
  it("enregistre le contrôle des mots de passe compromis", () => {
    expect(plugins().map((plugin) => plugin.id)).toContain("have-i-been-pwned")
  })

  it("hache le code de la Vérification de l'e-mail au repos", () => {
    const emailOtp = plugins().find((plugin) => plugin.id === "email-otp")

    expect(emailOtp?.options?.storeOTP).toBe("hashed")
  })
})
