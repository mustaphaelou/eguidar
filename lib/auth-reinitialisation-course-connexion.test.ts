import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const codesEnvoyes = vi.hoisted(() => new Map<string, string>())
const barriere = vi.hoisted(() => {
  let annoncerEntree = () => {}
  let ouvrir = () => {}
  const entree = new Promise<void>((resolve) => {
    annoncerEntree = resolve
  })
  const passe = new Promise<void>((resolve) => {
    ouvrir = resolve
  })
  const etat = { armee: false }
  return {
    entree,
    passe,
    etat,
    armer: () => {
      etat.armee = true
    },
    desarmer: () => {
      etat.armee = false
    },
    annoncerEntree: () => annoncerEntree(),
    ouvrir: () => ouvrir(),
  }
})

vi.mock("@/lib/emails", () => ({
  sendOtpEmail: async (email: string, code: string) => {
    codesEnvoyes.set(email.toLowerCase(), code)
  },
}))

vi.mock("@/lib/rehachage-mot-de-passe", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/rehachage-mot-de-passe")>()
  return {
    ...original,
    verifierMotDePasseEtRehacher: async (args: {
      hash: string
      password: string
    }) => {
      const valide = await original.verifierMotDePasseEtRehacher(args)
      if (barriere.etat.armee) {
        barriere.annoncerEntree()
        await barriere.passe
      }
      return valide
    },
  }
})

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { hacherMotDePasse } from "@/lib/mot-de-passe-hache"
import { refus } from "@/test/auth-doublures"
import { fauxServiceDeFuite } from "@/test/faux-service-de-fuite"

const runId = randomUUID().slice(0, 8)
const email = `course-reset-${runId}@test.ma`
const ANCIEN_MOT_DE_PASSE = "AncienMotDePasse!15"
const NOUVEAU_MOT_DE_PASSE = "NouveauMotDePasse!15"

beforeAll(async () => {
  vi.stubGlobal("fetch", fauxServiceDeFuite([]))

  const id = randomUUID()
  await prisma.user.create({
    data: { id, name: "Client en course", email, emailVerified: true },
  })
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hacherMotDePasse(ANCIEN_MOT_DE_PASSE),
    },
  })
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await prisma.verification.deleteMany({
    where: { identifier: { contains: `course-reset-${runId}` } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `course-reset-${runId}` } },
  })
  await prisma.$disconnect()
})

function entetesDeSession(entetes: Headers): Headers {
  const cookie = entetes
    .getSetCookie()
    .map((brut) => brut.split(";")[0])
    .join("; ")
  return new Headers({ cookie })
}

describe("Réinitialisation du mot de passe — course avec une Connexion", () => {
  it("éjecte la Connexion qui vérifiait encore l'ancien mot de passe", async () => {
    const sessionOuverte = await auth.api.signInEmail({
      body: { email, password: ANCIEN_MOT_DE_PASSE },
      returnHeaders: true,
    })
    const entetesAvant = entetesDeSession(sessionOuverte.headers)
    await expect(
      auth.api.getSession({ headers: entetesAvant })
    ).resolves.toMatchObject({ user: { email } })

    await auth.api.sendVerificationOTP({
      body: { email, type: "forget-password" },
    })
    const code = codesEnvoyes.get(email)
    expect(code).toBeTypeOf("string")

    barriere.armer()
    const connexionEnCours = auth.api.signInEmail({
      body: { email, password: ANCIEN_MOT_DE_PASSE },
      returnHeaders: true,
    })
    await barriere.entree

    const reinitialisation = await auth.api.resetPasswordEmailOTP({
      body: { email, otp: code!, password: NOUVEAU_MOT_DE_PASSE },
    })
    expect(reinitialisation.success).toBe(true)

    barriere.ouvrir()
    barriere.desarmer()
    const connexionApres = await connexionEnCours
    expect(connexionApres.response.user.email).toBe(email)

    await expect(
      auth.api.getSession({ headers: entetesDeSession(connexionApres.headers) })
    ).resolves.toBeNull()
    await expect(
      auth.api.getSession({ headers: entetesAvant })
    ).resolves.toBeNull()
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0)

    const refusAncien = await refus(
      auth.api.signInEmail({
        body: { email, password: ANCIEN_MOT_DE_PASSE },
      })
    )
    expect(refusAncien.code).toBe("INVALID_EMAIL_OR_PASSWORD")

    const reconnexion = await auth.api.signInEmail({
      body: { email, password: NOUVEAU_MOT_DE_PASSE },
    })
    expect(reconnexion.user.email).toBe(email)
    expect(reconnexion.token).toBeTruthy()
  }, 30_000)
})
