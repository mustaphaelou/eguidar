import { describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"
import { SESSION_INACTIVE_SECONDS } from "@/lib/session-constants"

describe("server session backstop", () => {
  it("expires sessions after the shared 30-minute inactivity window", () => {
    expect(SESSION_INACTIVE_SECONDS).toBe(30 * 60)
    expect(auth.options.session?.expiresIn).toBe(SESSION_INACTIVE_SECONDS)
    expect(auth.options.session?.updateAge).toBe(SESSION_INACTIVE_SECONDS)
  })
})
