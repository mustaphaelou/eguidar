import { beforeEach, describe, expect, it, vi } from "vitest"

const { getSession, deleteMany } = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}))

vi.mock("@/lib/db", () => ({
  prisma: { session: { deleteMany } },
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
import {
  SESSION_ABSOLUTE_ADMIN_SECONDS,
  SESSION_ABSOLUTE_CLIENT_SECONDS,
  SESSION_INACTIVE_SECONDS,
} from "@/lib/session-constants"

const JOUR_MS = 24 * 60 * 60 * 1000
const HEURE_MS = 60 * 60 * 1000

const COMPTE = {
  id: "compte-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "admin",
}

function client(role: Role): Client {
  return { ...COMPTE, role }
}

function sessionDe(
  role: string,
  createdAt = new Date(),
  expiresAt = new Date(Date.now() + SESSION_INACTIVE_SECONDS * 1000)
) {
  return {
    user: { ...COMPTE, role },
    session: { token: "jeton-session", createdAt, expiresAt },
  }
}

describe("lireSession", () => {
  beforeEach(() => {
    getSession.mockReset()
    deleteMany.mockReset()
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
    expect(deleteMany).not.toHaveBeenCalled()
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
      ...sessionDe("user"),
      user: { ...COMPTE, id: "compte-2", role: "user" },
    })

    await expect(lireSession()).resolves.toMatchObject({
      id: "compte-2",
      role: "user",
    })
  })

  it("termine à la borne exacte de 30 jours, quelle que soit l'activité qui a repoussé expiresAt", async () => {
    getSession.mockResolvedValue(
      sessionDe("user", new Date(Date.now() - 30 * JOUR_MS))
    )

    await expect(lireSession()).resolves.toBeNull()
    expect(deleteMany).toHaveBeenCalledWith({
      where: { token: "jeton-session" },
    })
  })

  it("termine une session de Client plus vieille que 30 jours et supprime sa ligne", async () => {
    getSession.mockResolvedValue(
      sessionDe("user", new Date(Date.now() - 31 * JOUR_MS))
    )

    await expect(lireSession()).resolves.toBeNull()
    expect(deleteMany).toHaveBeenCalledTimes(1)
  })

  it("accepte une session de Client encore dans sa durée absolue", async () => {
    getSession.mockResolvedValue(
      sessionDe("user", new Date(Date.now() - 29 * JOUR_MS))
    )

    await expect(lireSession()).resolves.toMatchObject({ role: "user" })
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it("termine une session d'Administration plus tôt que celle d'un Client", async () => {
    getSession.mockResolvedValue(
      sessionDe("admin", new Date(Date.now() - 25 * HEURE_MS))
    )

    await expect(lireSession()).resolves.toBeNull()
    expect(deleteMany).toHaveBeenCalledTimes(1)
  })

  it("accepte une session d'Administration encore dans sa durée absolue", async () => {
    getSession.mockResolvedValue(
      sessionDe("admin", new Date(Date.now() - 23 * HEURE_MS))
    )

    await expect(lireSession()).resolves.toMatchObject({ role: "admin" })
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it("ramène le rôle dans l'union typée", async () => {
    getSession.mockResolvedValue(sessionDe("customer"))

    const client = await lireSession()
    const role: Role = client!.role

    expect(role).toBe("user")
  })
})

describe("Durées absolues de session", () => {
  it("borne le Client et l'Administration, tous deux au-delà de l'inactivité", () => {
    expect(SESSION_ABSOLUTE_CLIENT_SECONDS).toBe(30 * 24 * 60 * 60)
    expect(SESSION_ABSOLUTE_ADMIN_SECONDS).toBe(24 * 60 * 60)
    expect(SESSION_ABSOLUTE_ADMIN_SECONDS).toBeLessThan(
      SESSION_ABSOLUTE_CLIENT_SECONDS
    )
    expect(SESSION_ABSOLUTE_ADMIN_SECONDS).toBeGreaterThan(
      SESSION_INACTIVE_SECONDS
    )
    expect(SESSION_ABSOLUTE_CLIENT_SECONDS).toBeGreaterThan(
      SESSION_INACTIVE_SECONDS
    )
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
