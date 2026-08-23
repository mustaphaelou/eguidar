import { describe, expect, it } from "vitest"

import { UserFacingError } from "@/lib/use-cases/user-facing-error"

describe("UserFacingError", () => {
  it("is an Error carrying the message", () => {
    const error = new UserFacingError("Ville introuvable")

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe("Ville introuvable")
  })

  it("names itself for a readable stack trace", () => {
    expect(new UserFacingError("x").name).toBe("UserFacingError")
    expect(new UserFacingError("x").stack).toContain("UserFacingError")
  })
})
