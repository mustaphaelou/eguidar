import { describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"

interface PluginAvecOptions {
  id: string
  options?: { storeOTP?: string; paths?: string[] }
}

function plugins(): PluginAvecOptions[] {
  return (auth.options.plugins ?? []) as unknown as PluginAvecOptions[]
}

describe("Authentification : les secrets au repos", () => {
  it("enregistre le contrôle des mots de passe compromis", () => {
    expect(plugins().map((plugin) => plugin.id)).toContain("have-i-been-pwned")
  })

  it("borne le contrôle des fuites à l'Inscription et à la réinitialisation", () => {
    const pwned = plugins().find((plugin) => plugin.id === "have-i-been-pwned")

    expect(pwned?.options?.paths).toEqual([
      "/sign-up/email",
      "/reset-password",
      "/email-otp/reset-password",
    ])
  })

  it("hache le code de la Vérification de l'e-mail au repos", () => {
    const emailOtp = plugins().find((plugin) => plugin.id === "email-otp")

    expect(emailOtp?.options?.storeOTP).toBe("hashed")
  })
})
