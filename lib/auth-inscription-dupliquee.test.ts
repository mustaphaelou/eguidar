import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const codesEnvoyes = vi.hoisted(() => new Map<string, string>())

vi.mock("@/lib/emails", () => ({
  sendOtpEmail: vi.fn(async (email: string, otp: string) => {
    codesEnvoyes.set(email.toLowerCase(), otp)
  }),
}))

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { refus } from "@/test/auth-doublures"
import { fauxServiceDeFuite } from "@/test/faux-service-de-fuite"

const runId = randomUUID().slice(0, 8)
const prefixe = `inscription-dupliquee-${runId}`

function adresse(nom: string) {
  return `${prefixe}-${nom}@test.ma`
}

function codeEnvoye(adresseEmail: string) {
  const code = codesEnvoyes.get(adresseEmail.toLowerCase())
  expect(code, `le code envoyé à ${adresseEmail}`).toBeTypeOf("string")
  return code!
}

async function compteCredential(adresseEmail: string) {
  const client = await prisma.user.findUnique({
    where: { email: adresseEmail },
    include: { accounts: true },
  })
  return client?.accounts.find((compte) => compte.providerId === "credential")
}

async function nombreDeSessions(adresseEmail: string) {
  return prisma.session.count({ where: { user: { email: adresseEmail } } })
}

async function poserSession(userId: string) {
  await prisma.session.create({
    data: {
      id: randomUUID(),
      token: randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  })
}

beforeAll(() => {
  vi.stubGlobal("fetch", fauxServiceDeFuite([]))
})

afterAll(async () => {
  vi.unstubAllGlobals()
  const clients = await prisma.user.findMany({
    where: { email: { startsWith: prefixe } },
    select: { id: true },
  })
  await prisma.verification.deleteMany({
    where: {
      OR: [
        { identifier: { contains: prefixe } },
        {
          identifier: {
            in: clients.map(
              (client) => `revoke-unproven-account-access:${client.id}`
            ),
          },
        },
      ],
    },
  })
  await prisma.user.deleteMany({ where: { email: { startsWith: prefixe } } })
  await prisma.$disconnect()
})

describe("Inscription sur une adresse déjà connue", () => {
  it("la Victime n'hérite pas du mot de passe posé par le préinscrit", async () => {
    const adresseVictime = adresse("victime")
    const motDePasseAttaquant = "AttaquantMotDePasse!15"
    const motDePasseVictime = "VictimeMotDePasse!15"

    await auth.api.signUpEmail({
      body: {
        email: adresseVictime,
        password: motDePasseAttaquant,
        name: "Préinscrit",
      },
    })
    const preinscrit = await prisma.user.findUniqueOrThrow({
      where: { email: adresseVictime },
    })
    expect(preinscrit.emailVerified).toBe(false)
    expect(await compteCredential(adresseVictime)).toBeTruthy()
    await poserSession(preinscrit.id)

    const doublon = await auth.api.signUpEmail({
      body: {
        email: adresseVictime,
        password: motDePasseVictime,
        name: "Victime",
      },
    })
    expect(doublon.token).toBeNull()

    expect(await compteCredential(adresseVictime)).toBeUndefined()
    expect(await nombreDeSessions(adresseVictime)).toBe(0)
    const apresDoublon = await prisma.user.findUniqueOrThrow({
      where: { email: adresseVictime },
    })
    expect(apresDoublon.emailVerified).toBe(true)

    await auth.api.sendVerificationOTP({
      body: { email: adresseVictime, type: "email-verification" },
    })
    const verification = await auth.api.verifyEmailOTP({
      body: { email: adresseVictime, otp: codeEnvoye(adresseVictime) },
    })
    expect(verification.status).toBe(true)
    expect(verification.token).toBeTruthy()

    const refusAttaquant = await refus(
      auth.api.signInEmail({
        body: { email: adresseVictime, password: motDePasseAttaquant },
      })
    )
    expect(refusAttaquant.code).toBe("INVALID_EMAIL_OR_PASSWORD")
    expect(await compteCredential(adresseVictime)).toBeUndefined()
  })

  it("la première Inscription garde le mot de passe choisi jusqu'à la Connexion", async () => {
    const adresseClient = adresse("premiere")
    const motDePasse = "PremierMotDePasse!15"

    await auth.api.signUpEmail({
      body: {
        email: adresseClient,
        password: motDePasse,
        name: "Premier Client",
      },
    })
    expect(await compteCredential(adresseClient)).toBeTruthy()

    await auth.api.sendVerificationOTP({
      body: { email: adresseClient, type: "email-verification" },
    })
    const verification = await auth.api.verifyEmailOTP({
      body: { email: adresseClient, otp: codeEnvoye(adresseClient) },
    })
    expect(verification.status).toBe(true)

    const connexion = await auth.api.signInEmail({
      body: { email: adresseClient, password: motDePasse },
    })
    expect(connexion.user.email).toBe(adresseClient)
    expect(connexion.token).toBeTruthy()
  })

  it("un doublon sur une adresse vérifiée laisse le mot de passe en place", async () => {
    const adresseClient = adresse("verifie")
    const motDePasse = "VerifieMotDePasse!15"

    await auth.api.signUpEmail({
      body: {
        email: adresseClient,
        password: motDePasse,
        name: "Client vérifié",
      },
    })
    await auth.api.sendVerificationOTP({
      body: { email: adresseClient, type: "email-verification" },
    })
    await auth.api.verifyEmailOTP({
      body: { email: adresseClient, otp: codeEnvoye(adresseClient) },
    })

    const doublon = await auth.api.signUpEmail({
      body: {
        email: adresseClient,
        password: "AutreMotDePasse!15",
        name: "Doublon",
      },
    })
    expect(doublon.token).toBeNull()

    expect(await compteCredential(adresseClient)).toBeTruthy()
    const connexion = await auth.api.signInEmail({
      body: { email: adresseClient, password: motDePasse },
    })
    expect(connexion.user.email).toBe(adresseClient)
    expect(connexion.token).toBeTruthy()
  })

  it("la Réinitialisation du mot de passe pose un secret après la révocation", async () => {
    const adresseVictime = adresse("reinitialisation")
    const motDePasseAttaquant = "AttaquantReset!15"
    const nouveauMotDePasse = "NouveauSecret!15"

    await auth.api.signUpEmail({
      body: {
        email: adresseVictime,
        password: motDePasseAttaquant,
        name: "Préinscrit",
      },
    })
    await auth.api.signUpEmail({
      body: {
        email: adresseVictime,
        password: "VictimeReset!15",
        name: "Victime",
      },
    })
    expect(await compteCredential(adresseVictime)).toBeUndefined()

    await auth.api.sendVerificationOTP({
      body: { email: adresseVictime, type: "email-verification" },
    })
    await auth.api.verifyEmailOTP({
      body: { email: adresseVictime, otp: codeEnvoye(adresseVictime) },
    })

    await auth.api.sendVerificationOTP({
      body: { email: adresseVictime, type: "forget-password" },
    })
    const reinitialisation = await auth.api.resetPasswordEmailOTP({
      body: {
        email: adresseVictime,
        otp: codeEnvoye(adresseVictime),
        password: nouveauMotDePasse,
      },
    })
    expect(reinitialisation.success).toBe(true)

    const connexion = await auth.api.signInEmail({
      body: { email: adresseVictime, password: nouveauMotDePasse },
    })
    expect(connexion.user.email).toBe(adresseVictime)
    expect(connexion.token).toBeTruthy()

    const refusAttaquant = await refus(
      auth.api.signInEmail({
        body: { email: adresseVictime, password: motDePasseAttaquant },
      })
    )
    expect(refusAttaquant.code).toBe("INVALID_EMAIL_OR_PASSWORD")
  })
})
