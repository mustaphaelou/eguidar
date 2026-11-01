import { randomUUID } from "node:crypto"

import { prismaAdapter } from "better-auth/adapters/prisma"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"

const PREFIXE = `identite-fournisseur-${randomUUID().slice(0, 8)}-`

const adapter = prismaAdapter(prisma, { provider: "postgresql" })({})

let userId: string

function creerIdentiteFournisseur(providerId: string, accountId: string) {
  return adapter.create({
    model: "account",
    data: { providerId, accountId, userId },
  })
}

beforeAll(async () => {
  const utilisateur = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: "Client identité fournisseur",
      email: `${PREFIXE}client@test.ma`,
    },
  })
  userId = utilisateur.id
})

afterAll(async () => {
  await prisma.account.deleteMany({
    where: { user: { email: { startsWith: PREFIXE } } },
  })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXE } } })
  await prisma.$disconnect()
})

describe("l'identité d'un fournisseur ne désigne qu'un seul Compte client", () => {
  it("refuse une seconde ligne pour la même paire (providerId, accountId)", async () => {
    const accountId = `google-${randomUUID()}`

    await creerIdentiteFournisseur("google", accountId)

    await expect(
      creerIdentiteFournisseur("google", accountId)
    ).rejects.toMatchObject({
      code: "P2002",
    })
    await expect(
      prisma.account.count({ where: { providerId: "google", accountId } })
    ).resolves.toBe(1)
  })

  it("accepte la même identité chez un autre fournisseur", async () => {
    const accountId = `identite-${randomUUID()}`

    await creerIdentiteFournisseur("google", accountId)
    await expect(
      creerIdentiteFournisseur("facebook", accountId)
    ).resolves.toMatchObject({
      providerId: "facebook",
      accountId,
    })
    await expect(prisma.account.count({ where: { accountId } })).resolves.toBe(
      2
    )
  })

  it("accepte deux paires différentes du même fournisseur", async () => {
    const premiereIdentite = `identite-${randomUUID()}`
    const secondeIdentite = `identite-${randomUUID()}`

    await expect(
      creerIdentiteFournisseur("google", premiereIdentite)
    ).resolves.toMatchObject({
      providerId: "google",
      accountId: premiereIdentite,
    })
    await expect(
      creerIdentiteFournisseur("google", secondeIdentite)
    ).resolves.toMatchObject({
      providerId: "google",
      accountId: secondeIdentite,
    })
  })
})
