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
})
