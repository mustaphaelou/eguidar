import { describe, expect, it } from "vitest"

import {
  AdminGateError,
  adminLoginUrl,
  isAdminRole,
  requireAdminRole,
} from "@/lib/use-cases/admin-gate"

describe("isAdminRole", () => {
  it("returns true for an admin", () => {
    expect(isAdminRole({ role: "admin" })).toBe(true)
  })

  it("returns false for a regular user", () => {
    expect(isAdminRole({ role: "user" })).toBe(false)
  })

  it("returns false when the role is missing or unknown", () => {
    expect(isAdminRole({})).toBe(false)
    expect(isAdminRole({ role: "customer" })).toBe(false)
    expect(isAdminRole(null)).toBe(false)
    expect(isAdminRole(undefined)).toBe(false)
  })
})

describe("requireAdminRole", () => {
  it("does not throw for an admin", () => {
    expect(() => requireAdminRole({ role: "admin" })).not.toThrow()
  })

  it("throws AdminGateError for a regular user", () => {
    expect(() => requireAdminRole({ role: "user" })).toThrow(AdminGateError)
  })

  it("throws AdminGateError when no user is passed", () => {
    expect(() => requireAdminRole(null)).toThrow(AdminGateError)
  })
})

describe("adminLoginUrl", () => {
  it("opens the login modal on the home page with next=/admin", () => {
    expect(adminLoginUrl()).toBe("/?open=login&next=%2Fadmin")
  })
})
