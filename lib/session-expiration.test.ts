import { randomUUID } from "node:crypto"

import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  estHorsDureeAbsolue,
  revoquerSessionHorsDuree,
} from "@/lib/session-expiration"
import {
  SESSION_ABSOLUTE_ADMIN_SECONDS,
  SESSION_ABSOLUTE_CLIENT_SECONDS,
} from "@/lib/session-constants"

const runId = randomUUID().slice(0, 8)
const HEURE_MS = 60 * 60 * 1000
const JOUR_MS = 24 * HEURE_MS

async function creerSession(
  createdAt: Date,
  role = "user"
): Promise<{ token: string; userId: string }> {
  const userId = randomUUID()
  await prisma.user.create({
    data: {
      id: userId,
      name: "Client expiré",
      email: `expiration-${runId}-${userId}@test.ma`,
      role,
    },
  })
  const token = `jeton-${userId}`
  await prisma.session.create({
    data: {
      id: randomUUID(),
      token,
      userId,
      createdAt,
      expiresAt: new Date(Date.now() + JOUR_MS),
    },
  })
  return { token, userId }
}

afterAll(async () => {
  await prisma.session.deleteMany({
    where: { user: { email: { contains: runId } } },
  })
  await prisma.user.deleteMany({
    where: { email: { contains: runId } },
  })
  await prisma.$disconnect()
})

describe("Session hors durée absolue", () => {
  it("reconnaît le dépassement sans toucher à la base", () => {
    const session = {
      user: { role: "user" },
      session: {
        token: "peu-importe",
        createdAt: new Date(Date.now() - 31 * JOUR_MS),
      },
    }

    expect(estHorsDureeAbsolue(session)).toBe(true)
    expect(
      estHorsDureeAbsolue({
        ...session,
        session: {
          ...session.session,
          createdAt: new Date(Date.now() - 29 * JOUR_MS),
        },
      })
    ).toBe(false)
  })

  it("applique la borne plus courte de l'Administration", () => {
    expect(SESSION_ABSOLUTE_ADMIN_SECONDS).toBeLessThan(
      SESSION_ABSOLUTE_CLIENT_SECONDS
    )
    expect(
      estHorsDureeAbsolue({
        user: { role: "admin" },
        session: {
          token: "peu-importe",
          createdAt: new Date(Date.now() - 25 * HEURE_MS),
        },
      })
    ).toBe(true)
    expect(
      estHorsDureeAbsolue({
        user: { role: "admin" },
        session: {
          token: "peu-importe",
          createdAt: new Date(Date.now() - 23 * HEURE_MS),
        },
      })
    ).toBe(false)
  })

  it("supprime la ligne de session dépassée, et seulement elle", async () => {
    const ancienne = await creerSession(new Date(Date.now() - 31 * JOUR_MS))
    const recente = await creerSession(new Date(Date.now() - JOUR_MS))

    await expect(
      revoquerSessionHorsDuree({
        user: { role: "user" },
        session: {
          token: ancienne.token,
          createdAt: new Date(Date.now() - 31 * JOUR_MS),
        },
      })
    ).resolves.toBe(true)

    await expect(
      prisma.session.findUnique({ where: { token: ancienne.token } })
    ).resolves.toBeNull()
    await expect(
      prisma.session.findUnique({ where: { token: recente.token } })
    ).resolves.not.toBeNull()

    await expect(
      revoquerSessionHorsDuree({
        user: { role: "user" },
        session: {
          token: recente.token,
          createdAt: new Date(Date.now() - JOUR_MS),
        },
      })
    ).resolves.toBe(false)
    await expect(
      prisma.session.findUnique({ where: { token: recente.token } })
    ).resolves.not.toBeNull()
  })
})
