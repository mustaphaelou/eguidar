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

const runId = randomUUID().slice(0, 8)
const email = `auth-parcours-${runId}@test.ma`
const motDePasse = "MotDePasse!818"

const RANGE_PWNED = "api.pwnedpasswords.com/range/"

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entree: RequestInfo | URL) => {
      const url =
        typeof entree === "string"
          ? entree
          : entree instanceof URL
            ? entree.href
            : entree.url
      if (url.includes(RANGE_PWNED)) {
        return new Response("0000000000000000000000000000000000:1\n", {
          status: 200,
          headers: { "content-type": "text/plain" },
        })
      }
      throw new Error(`Appel réseau interdit pendant le test : ${url}`)
    })
  )
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await prisma.verification.deleteMany({
    where: { identifier: { contains: email } },
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
    const code = codesEnvoyes.get(email)
    expect(code, "le code envoyé à l'Inscription").toBeTypeOf("string")

    const verification = await auth.api.verifyEmailOTP({
      body: { email, otp: code! },
    })
    expect(verification.status).toBe(true)
    expect(verification.user.emailVerified).toBe(true)

    const connexion = await auth.api.signInEmail({
      body: { email, password: motDePasse },
    })
    expect(connexion.user.email).toBe(email)
    expect(connexion.token).toBeTruthy()
  })
})
