import { beforeEach, describe, expect, it, vi } from "vitest"

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}))

import {
  estAdmin,
  lireSession,
  type Client,
  type Role,
} from "@/lib/use-cases/session-courante"

const COMPTE = {
  id: "compte-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "admin",
}

function client(role: Role): Client {
  return { ...COMPTE, role }
}

function sessionDe(role: string) {
  return { user: { ...COMPTE, role }, session: {} }
}

describe("lireSession", () => {
  beforeEach(() => {
    getSession.mockReset()
  })

  it("répond les faits d'identité du Client quand une session existe", async () => {
    getSession.mockResolvedValue(sessionDe("admin"))

    await expect(lireSession()).resolves.toEqual({
      id: "compte-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "admin",
    })
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) })
  })

  it("répond null quand il n'y a pas de session", async () => {
    getSession.mockResolvedValue(null)

    await expect(lireSession()).resolves.toBeNull()
  })

  it("hors rendu, chaque appel relit la session au lieu de réutiliser la précédente", async () => {
    getSession.mockResolvedValue(sessionDe("admin"))
    await expect(lireSession()).resolves.toMatchObject({
      id: "compte-1",
      role: "admin",
    })

    getSession.mockResolvedValue({
      user: { ...COMPTE, id: "compte-2", role: "user" },
      session: {},
    })

    await expect(lireSession()).resolves.toMatchObject({
      id: "compte-2",
      role: "user",
    })
  })

  it("ramène le rôle dans l'union typée", async () => {
    getSession.mockResolvedValue(sessionDe("customer"))

    const client = await lireSession()
    const role: Role = client!.role

    expect(role).toBe("user")
  })
})

describe("estAdmin", () => {
  it("reconnaît un administrateur", () => {
    expect(estAdmin(client("admin"))).toBe(true)
  })

  it("refuse un Client qui n'est pas administrateur", () => {
    expect(estAdmin(client("user"))).toBe(false)
  })

  it("refuse l'absence de Client", () => {
    expect(estAdmin(null)).toBe(false)
  })
})
