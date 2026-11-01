import { randomUUID } from "node:crypto"

import { hashPassword } from "better-auth/crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { PARAMETRES_SCRYPT } from "@/lib/mot-de-passe-hache"
import { refus } from "@/test/auth-doublures"

const runId = randomUUID().slice(0, 8)
const email = `rehachage-${runId}@test.ma`
const emailSansRehachage = `rehachage-echec-${runId}@test.ma`
const MOT_DE_PASSE = "MotDePasse!Rehache1"

async function motDePasseStocke(adresse: string): Promise<string | null> {
  const compte = await prisma.account.findFirst({
    where: { user: { email: adresse }, providerId: "credential" },
    select: { password: true },
  })
  return compte?.password ?? null
}

async function creerCompte(
  adresse: string,
  hashMotDePasse: string
): Promise<void> {
  const id = randomUUID()
  await prisma.user.create({
    data: { id, name: "Client Rehaché", email: adresse, emailVerified: true },
  })
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hashMotDePasse,
    },
  })
}

beforeAll(async () => {
  await creerCompte(email, await hashPassword(MOT_DE_PASSE))
  await creerCompte(emailSansRehachage, await hashPassword(MOT_DE_PASSE))
})

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: `rehachage-${runId}` } },
  })
  await prisma.$disconnect()
})

describe("Connexion par mot de passe — rehachage opportuniste", () => {
  it("vérifie un ancien hash, le rehashe et permet une seconde Connexion", async () => {
    const avant = await motDePasseStocke(email)
    expect(avant).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)

    const premiere = await auth.api.signInEmail({
      body: { email, password: MOT_DE_PASSE },
      headers: new Headers({ "x-forwarded-for": "198.51.100.200" }),
    })
    expect(premiere.user.email).toBe(email)

    const apres = await motDePasseStocke(email)
    expect(apres).toMatch(
      new RegExp(
        `^\\$scrypt\\$N=${PARAMETRES_SCRYPT.N},r=${PARAMETRES_SCRYPT.r},p=${PARAMETRES_SCRYPT.p}\\$`
      )
    )
    expect(apres).not.toBe(avant)

    const seconde = await auth.api.signInEmail({
      body: { email, password: MOT_DE_PASSE },
      headers: new Headers({ "x-forwarded-for": "198.51.100.201" }),
    })
    expect(seconde.user.email).toBe(email)
    await expect(motDePasseStocke(email)).resolves.toBe(apres)
  })

  it("refuse un mauvais mot de passe et ne réécrit pas un hash encore historique", async () => {
    const avant = await motDePasseStocke(emailSansRehachage)
    expect(avant).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)

    const echec = await refus(
      auth.api.signInEmail({
        body: { email: emailSansRehachage, password: "MauvaisMotDePasse!1" },
        headers: new Headers({ "x-forwarded-for": "198.51.100.202" }),
      })
    )
    expect(echec.code).toBe("INVALID_EMAIL_OR_PASSWORD")
    await expect(motDePasseStocke(emailSansRehachage)).resolves.toBe(avant)
  })
})
