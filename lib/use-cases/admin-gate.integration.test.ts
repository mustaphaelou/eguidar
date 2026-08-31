import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  AdminGateError,
  isAdminRole,
  requireAdminRole,
} from "@/lib/use-cases/admin-gate"

const adminEmail = `admin-${randomUUID()}@test.local`
const userEmail = `user-${randomUUID()}@test.local`

describe("admin role gate against the database", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: adminEmail,
        name: "Admin Test",
        role: "admin",
        emailVerified: true,
      },
    })
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: userEmail,
        name: "User Test",
        role: "user",
        emailVerified: true,
      },
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, userEmail] } },
    })
    await prisma.$disconnect()
  })

  it("accepts the admin fetched from the database", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    })
    expect(isAdminRole(user)).toBe(true)
    expect(() => requireAdminRole(user)).not.toThrow()
  })

  it("rejects a regular user fetched from the database", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: userEmail },
    })
    expect(isAdminRole(user)).toBe(false)
    expect(() => requireAdminRole(user)).toThrow(AdminGateError)
  })
})
