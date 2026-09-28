import { describe, expect, it, vi } from "vitest"

import { auth } from "@/lib/auth"

describe("Connexion sociale : configuration serveur", () => {
  it("registers Facebook alongside Google and no longer Apple", () => {
    const providers = auth.options.socialProviders ?? {}

    expect(Object.keys(providers).sort()).toEqual(["facebook", "google"])
  })

  it("reads the Facebook credentials from the environment", async () => {
    vi.stubEnv("FACEBOOK_CLIENT_ID", "facebook-client-id")
    vi.stubEnv("FACEBOOK_CLIENT_SECRET", "facebook-client-secret")
    vi.resetModules()

    const { auth: freshAuth } = await import("@/lib/auth")

    expect(freshAuth.options.socialProviders?.facebook.clientId).toBe(
      "facebook-client-id"
    )
    expect(freshAuth.options.socialProviders?.facebook.clientSecret).toBe(
      "facebook-client-secret"
    )

    vi.unstubAllEnvs()
  })

  it("marks a Facebook profile's e-mail as verified", async () => {
    const mapProfileToUser = auth.options.socialProviders?.facebook
      .mapProfileToUser as
      ((profile: Record<string, unknown>) => unknown) | undefined

    expect(mapProfileToUser).toBeTypeOf("function")

    const profile = {
      id: "1",
      name: "Client",
      email: "client@test.ma",
      email_verified: undefined,
    }

    expect(await mapProfileToUser?.(profile)).toEqual({ emailVerified: true })
  })

  it("keeps account-linking options at Better Auth defaults", () => {
    const accountOptions = (
      auth.options as unknown as {
        account?: {
          accountLinking?: {
            requireLocalEmailVerified?: boolean
            trustedProviders?: string[]
          }
        }
      }
    ).account

    expect(accountOptions?.accountLinking?.requireLocalEmailVerified).not.toBe(
      false
    )
    expect(accountOptions?.accountLinking?.trustedProviders ?? []).toEqual([])
  })
})
