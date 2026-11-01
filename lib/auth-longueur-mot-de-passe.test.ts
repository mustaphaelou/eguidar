import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const codesEnvoyes = vi.hoisted(() => new Map<string, string>())

vi.mock("@/lib/emails", () => ({
  sendOtpEmail: async (email: string, code: string) => {
    codesEnvoyes.set(email.toLowerCase(), code)
  },
}))

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { LONGUEUR_MINIMALE_MOT_DE_PASSE } from "@/lib/longueur-mot-de-passe"
import { hacheMotDePasseHistorique, refus } from "@/test/auth-doublures"
import { fauxServiceDeFuite } from "@/test/faux-service-de-fuite"

const runId = randomUUID().slice(0, 8)
const adresse = (suffixe: string) => `longueur-mdp-${runId}-${suffixe}@test.ma`
const MOT_DE_PASSE_14 = "MotDePasse!123"
const MOT_DE_PASSE_15 = "MotDePasse!1234"
const ANCIEN_MOT_DE_PASSE = "AncienMotDePasse!15"

async function creerCompteAvecMotDePasse(
  email: string,
  motDePasse: string
): Promise<void> {
  const id = randomUUID()
  await prisma.user.create({
    data: {
      id,
      name: "Client historique",
      email,
      emailVerified: true,
    },
  })
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hacheMotDePasseHistorique(motDePasse),
    },
  })
}

beforeAll(() => {
  vi.stubGlobal("fetch", fauxServiceDeFuite([]))
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await prisma.verification.deleteMany({
    where: { identifier: { contains: `longueur-mdp-${runId}` } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `longueur-mdp-${runId}-` } },
  })
  await prisma.$disconnect()
})

describe("Longueur minimale du mot de passe — 15 caractères", () => {
  it("la configuration serveur exige exactement le plancher partagé", () => {
    expect(LONGUEUR_MINIMALE_MOT_DE_PASSE).toBe(15)
    expect(auth.options.emailAndPassword?.minPasswordLength).toBe(
      LONGUEUR_MINIMALE_MOT_DE_PASSE
    )
  })

  it("refuse 14 caractères à l'Inscription et accepte 15", async () => {
    const refusInscription = await refus(
      auth.api.signUpEmail({
        body: {
          name: "Client Court",
          email: adresse("court"),
          password: MOT_DE_PASSE_14,
        },
      })
    )
    expect(refusInscription.code).toBe("PASSWORD_TOO_SHORT")
    expect(
      await prisma.user.count({ where: { email: adresse("court") } })
    ).toBe(0)

    const inscription = await auth.api.signUpEmail({
      body: {
        name: "Client Juste",
        email: adresse("juste"),
        password: MOT_DE_PASSE_15,
      },
    })
    expect(inscription.user.email).toBe(adresse("juste"))
  })

  it("laisse un Compte client dont le mot de passe existant est plus court se connecter", async () => {
    await creerCompteAvecMotDePasse(adresse("historique"), "court123")

    const connexion = await auth.api.signInEmail({
      body: { email: adresse("historique"), password: "court123" },
    })

    expect(connexion.user.email).toBe(adresse("historique"))
    expect(connexion.token).toBeTruthy()
  })

  it("refuse 14 caractères à la réinitialisation et accepte 15", async () => {
    await creerCompteAvecMotDePasse(
      adresse("reinitialisation"),
      ANCIEN_MOT_DE_PASSE
    )

    await auth.api.sendVerificationOTP({
      body: { email: adresse("reinitialisation"), type: "forget-password" },
    })
    const code = codesEnvoyes.get(adresse("reinitialisation"))
    expect(code).toBeTypeOf("string")

    const refusReinitialisation = await refus(
      auth.api.resetPasswordEmailOTP({
        body: {
          email: adresse("reinitialisation"),
          otp: code!,
          password: MOT_DE_PASSE_14,
        },
      })
    )
    expect(refusReinitialisation.code).toBe("PASSWORD_TOO_SHORT")

    const reinitialisation = await auth.api.resetPasswordEmailOTP({
      body: {
        email: adresse("reinitialisation"),
        otp: code!,
        password: MOT_DE_PASSE_15,
      },
    })
    expect(reinitialisation.success).toBe(true)

    const connexion = await auth.api.signInEmail({
      body: {
        email: adresse("reinitialisation"),
        password: MOT_DE_PASSE_15,
      },
    })
    expect(connexion.user.email).toBe(adresse("reinitialisation"))
  })
})
