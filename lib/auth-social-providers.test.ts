import { describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"

describe("social providers configuration", () => {
  it("registers Facebook alongside Google and no longer Apple", () => {
    const providers = auth.options.socialProviders ?? {}

    expect(Object.keys(providers).sort()).toEqual(["facebook", "google"])
  })

  it("reads the Facebook credentials from the environment", () => {
    expect(auth.options.socialProviders?.facebook.clientId).toBe(
      process.env.FACEBOOK_CLIENT_ID ?? ""
    )
    expect(auth.options.socialProviders?.facebook.clientSecret).toBe(
      process.env.FACEBOOK_CLIENT_SECRET ?? ""
    )
  })

  it("marks a Facebook profile's e-mail as verified", async () => {
    const mapProfileToUser = auth.options.socialProviders?.facebook
      .mapProfileToUser as
      | ((profile: Record<string, unknown>) => unknown)
      | undefined

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
