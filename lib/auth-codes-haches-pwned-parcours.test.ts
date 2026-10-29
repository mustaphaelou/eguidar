import { createHash, randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const envois = vi.hoisted(
  () => [] as { email: string; otp: string; type: string }[]
)
const fuites = vi.hoisted(() => new Map<string, string>())

vi.mock("@/lib/emails", () => ({
  sendOtpEmail: async (email: string, otp: string, type: string) => {
    envois.push({ email, otp, type })
  },
}))

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

const runId = randomUUID().slice(0, 8)
const email = (suffixe: string) => `codes-haches-${runId}-${suffixe}@test.ma`
const motDePasseSur = `mot-de-passe-sur-${runId}`
const motDePasseFuite = "password123"
const motDePasseFuiteReinitialisation = "qwerty123"

const RANGE_PWNED = "https://api.pwnedpasswords.com/range/"

function empreinteSha1(motDePasse: string): string {
  return createHash("sha1").update(motDePasse).digest("hex").toUpperCase()
}

function simulerFuite(motDePasse: string): void {
  const empreinte = empreinteSha1(motDePasse)
  fuites.set(empreinte.slice(0, 5), `${empreinte.slice(5)}:42`)
}

function urlDe(entree: string | URL | Request): string {
  if (typeof entree === "string") return entree
  if (entree instanceof URL) return entree.toString()
  return entree.url
}

async function refus(promesse: Promise<unknown>): Promise<{
  code?: string
  message?: string
  statusCode?: number
}> {
  try {
    await promesse
  } catch (error) {
    const { body, message, statusCode } = error as {
      body?: { code?: string; message?: string }
      message?: string
      statusCode?: number
    }
    return { code: body?.code, message, statusCode }
  }
  throw new Error("attendu : un refus de la bibliothèque")
}

beforeAll(() => {
  simulerFuite(motDePasseFuite)
  simulerFuite(motDePasseFuiteReinitialisation)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entree: string | URL | Request) => {
      const url = urlDe(entree)
      if (!url.startsWith(RANGE_PWNED)) {
        throw new Error(`appel réseau non simulé : ${url}`)
      }
      const prefixe = url.slice(RANGE_PWNED.length).toUpperCase()
      return new Response(`${fuites.get(prefixe) ?? ""}\r\n`, {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    })
  )
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await prisma.verification.deleteMany({
    where: { identifier: { contains: `codes-haches-${runId}` } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `codes-haches-${runId}-` } },
  })
  await prisma.$disconnect()
})

describe("Vérification de l'e-mail : le code est haché au repos", () => {
  it("écrit une empreinte SHA-256, jamais le code en clair, et refuse de le rendre", async () => {
    await auth.api.signUpEmail({
      body: {
        name: "Client Hachage",
        email: email("hachage"),
        password: motDePasseSur,
      },
    })

    await auth.api.sendVerificationOTP({
      body: { email: email("hachage"), type: "email-verification" },
    })

    const envoi = envois.find(
      (candidat) =>
        candidat.email === email("hachage") &&
        candidat.type === "email-verification"
    )
    expect(envoi?.otp).toMatch(/^\d{6}$/)

    const ligne = await prisma.verification.findFirst({
      where: { identifier: `email-verification-otp-${email("hachage")}` },
    })
    expect(ligne).not.toBeNull()

    const empreinte = createHash("sha256")
      .update(envoi!.otp)
      .digest("base64url")
    expect(ligne!.value).toBe(`${empreinte}:0`)
    expect(ligne!.value).not.toContain(envoi!.otp)

    await expect(
      auth.api.getVerificationOTP({
        query: { email: email("hachage"), type: "email-verification" },
      })
    ).rejects.toThrow(/hashed/)
  })
})

describe("Les mots de passe compromis sont refusés", () => {
  it("refuse une Inscription dont le mot de passe figure dans une fuite connue", async () => {
    const refusInscription = await refus(
      auth.api.signUpEmail({
        body: {
          name: "Client Fuité",
          email: email("fuite-inscription"),
          password: motDePasseFuite,
        },
      })
    )

    expect(refusInscription.code).toBe("PASSWORD_COMPROMISED")
    expect(refusInscription.message).toMatch(/compromised/i)
    await expect(
      prisma.user.findUnique({ where: { email: email("fuite-inscription") } })
    ).resolves.toBeNull()

    await auth.api.signUpEmail({
      body: {
        name: "Client Témoin",
        email: email("temoin"),
        password: motDePasseSur,
      },
    })
    const refusMotDePasseFaux = await refus(
      auth.api.signInEmail({
        body: { email: email("temoin"), password: "ce-n-est-pas-le-bon" },
      })
    )
    expect(refusMotDePasseFaux.code).toBe("INVALID_EMAIL_OR_PASSWORD")
    expect(refusMotDePasseFaux.code).not.toBe(refusInscription.code)
  })

  it("refuse la réinitialisation vers un mot de passe compromis et garde l'ancien", async () => {
    const emailReinitialisation = email("fuite-reinitialisation")
    await auth.api.signUpEmail({
      body: {
        name: "Client Réinitialisation",
        email: emailReinitialisation,
        password: motDePasseSur,
      },
    })

    await auth.api.sendVerificationOTP({
      body: { email: emailReinitialisation, type: "forget-password" },
    })

    const envoi = envois.find(
      (candidat) =>
        candidat.email === emailReinitialisation &&
        candidat.type === "forget-password"
    )
    expect(envoi?.otp).toMatch(/^\d{6}$/)

    const refusReinitialisation = await refus(
      auth.api.resetPasswordEmailOTP({
        body: {
          email: emailReinitialisation,
          otp: envoi!.otp,
          password: motDePasseFuiteReinitialisation,
        },
      })
    )

    expect(refusReinitialisation.code).toBe("PASSWORD_COMPROMISED")
    expect(refusReinitialisation.message).toMatch(/compromised/i)

    const ancienMotDePasse = await refus(
      auth.api.signInEmail({
        body: { email: emailReinitialisation, password: motDePasseSur },
      })
    )
    expect(ancienMotDePasse.code).toBe("EMAIL_NOT_VERIFIED")
    const motDePasseCompromis = await refus(
      auth.api.signInEmail({
        body: {
          email: emailReinitialisation,
          password: motDePasseFuiteReinitialisation,
        },
      })
    )
    expect(motDePasseCompromis.code).toBe("INVALID_EMAIL_OR_PASSWORD")
  })

  it("échoue fermé quand le service de fuites est indisponible", async () => {
    const fetchNominal = globalThis.fetch
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 }))
    )
    try {
      const refusReseau = await refus(
        auth.api.signUpEmail({
          body: {
            name: "Client Réseau",
            email: email("reseau"),
            password: motDePasseSur,
          },
        })
      )

      expect(refusReseau.statusCode).toBe(500)
      expect(refusReseau.message).toMatch(/Failed to check password/)
      await expect(
        prisma.user.findUnique({ where: { email: email("reseau") } })
      ).resolves.toBeNull()
    } finally {
      vi.stubGlobal("fetch", fetchNominal)
    }
  })
})
