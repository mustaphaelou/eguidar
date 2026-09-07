import { describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"
import {
  SESSION_INACTIVE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/session-constants"

describe("server session backstop", () => {
  it("expires sessions after the shared 30-minute inactivity window", () => {
    expect(SESSION_INACTIVE_SECONDS).toBe(30 * 60)
    expect(auth.options.session?.expiresIn).toBe(SESSION_INACTIVE_SECONDS)
  })

  it("refreshes sessions on activity well before expiry so the window slides", () => {
    expect(auth.options.session?.updateAge).toBe(SESSION_UPDATE_AGE_SECONDS)
    expect(SESSION_UPDATE_AGE_SECONDS).toBeGreaterThan(0)
    expect(SESSION_UPDATE_AGE_SECONDS).toBeLessThan(SESSION_INACTIVE_SECONDS)
  })
})
