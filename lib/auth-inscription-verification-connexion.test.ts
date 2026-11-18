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
import { fauxServiceDeFuite } from "@/test/faux-service-de-fuite"

const runId = randomUUID().slice(0, 8)
const email = `auth-parcours-${runId}@test.ma`
const motDePasse = "MotDePasse!8181"

function adresse(nom: string) {
  return `auth-parcours-${runId}-${nom}@test.ma`
}

function codeEnvoye(adresseEmail: string) {
  const code = codesEnvoyes.get(adresseEmail.toLowerCase())
  expect(code, `le code envoyé à ${adresseEmail}`).toBeTypeOf("string")
  return code!
}

beforeAll(() => {
  vi.stubGlobal("fetch", fauxServiceDeFuite([]))
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await prisma.verification.deleteMany({
    where: { identifier: { contains: `auth-parcours-${runId}` } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `auth-parcours-${runId}` } },
  })
  await prisma.$disconnect()
})

describe("Inscription → Vérification de l'e-mail → Connexion", () => {
  it("garde le mot de passe choisi à l'Inscription jusqu'à la Connexion", async () => {
    await auth.api.signUpEmail({
      body: { email, password: motDePasse, name: "Client 818" },
    })

    await auth.api.sendVerificationOTP({
      body: { email, type: "email-verification" },
    })
    const code = codeEnvoye(email)

    const verification = await auth.api.verifyEmailOTP({
      body: { email, otp: code },
    })
    expect(verification.status).toBe(true)
    expect(verification.user.emailVerified).toBe(true)
    expect(
      verification.token,
      "la Vérification de l'e-mail ouvre la Session"
    ).toBeTruthy()

    const connexion = await auth.api.signInEmail({
      body: { email, password: motDePasse },
    })
    expect(connexion.user.email).toBe(email)
    expect(connexion.token).toBeTruthy()
  })

  it("refuse la Connexion tant que l'e-mail n'est pas vérifié", async () => {
    const nonVerifie = adresse("non-verifie")
    await auth.api.signUpEmail({
      body: {
        email: nonVerifie,
        password: motDePasse,
        name: "Client non vérifié",
      },
    })

    await expect(
      auth.api.signInEmail({
        body: { email: nonVerifie, password: motDePasse },
      })
    ).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } })
  })

  it("signe le Compte client déjà vérifié qui échange un code depuis l'Inscription", async () => {
    const dejaVerifie = adresse("deja-verifie")
    await auth.api.signUpEmail({
      body: {
        email: dejaVerifie,
        password: motDePasse,
        name: "Client déjà vérifié",
      },
    })
    await auth.api.sendVerificationOTP({
      body: { email: dejaVerifie, type: "email-verification" },
    })
    await auth.api.verifyEmailOTP({
      body: { email: dejaVerifie, otp: codeEnvoye(dejaVerifie) },
    })

    const reprise = await auth.api.signUpEmail({
      body: {
        email: dejaVerifie,
        password: "AutreMotDePasse!4242",
        name: "Reprise",
      },
    })
    expect(
      reprise.token,
      "l'Inscription ne rend pas de jeton pour une adresse déjà connue"
    ).toBeNull()

    await auth.api.sendVerificationOTP({
      body: { email: dejaVerifie, type: "email-verification" },
    })
    const seconde = await auth.api.verifyEmailOTP({
      body: { email: dejaVerifie, otp: codeEnvoye(dejaVerifie) },
    })

    expect(seconde.status).toBe(true)
    expect(
      seconde.token,
      "l'échange du code ouvre la Session partout où il aboutit"
    ).toBeTruthy()
  })
})
