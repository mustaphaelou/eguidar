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
import { hacheMotDePasseHistorique, refus } from "@/test/auth-doublures"
import { fauxServiceDeFuite } from "@/test/faux-service-de-fuite"

const runId = randomUUID().slice(0, 8)
const email = `revocation-mdp-${runId}@test.ma`
const ANCIEN_MOT_DE_PASSE = "AncienMotDePasse!15"
const NOUVEAU_MOT_DE_PASSE = "NouveauMotDePasse!15"

beforeAll(async () => {
  vi.stubGlobal("fetch", fauxServiceDeFuite([]))

  const id = randomUUID()
  await prisma.user.create({
    data: { id, name: "Client révoqué", email, emailVerified: true },
  })
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hacheMotDePasseHistorique(ANCIEN_MOT_DE_PASSE),
    },
  })
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await prisma.verification.deleteMany({
    where: { identifier: { contains: `revocation-mdp-${runId}` } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `revocation-mdp-${runId}` } },
  })
  await prisma.$disconnect()
})

/** Rejoue les cookies d'une réponse de Connexion comme en-tête de requête. */
function entetesDeSession(entetes: Headers): Headers {
  const cookie = entetes
    .getSetCookie()
    .map((brut) => brut.split(";")[0])
    .join("; ")
  return new Headers({ cookie })
}

async function ouvrirSession(): Promise<Headers> {
  const connexion = await auth.api.signInEmail({
    body: { email, password: ANCIEN_MOT_DE_PASSE },
    returnHeaders: true,
  })
  return entetesDeSession(connexion.headers)
}

describe("Réinitialisation du mot de passe — révocation des sessions", () => {
  it("termine toutes les sessions ouvertes avant la réinitialisation, et le Client se reconnecte", async () => {
    // Deux appareils : la révocation doit emporter chaque session, pas seulement
    // celle qui demande le changement.
    const premierAppareil = await ouvrirSession()
    const secondAppareil = await ouvrirSession()

    await expect(
      auth.api.getSession({ headers: premierAppareil })
    ).resolves.toMatchObject({ user: { email } })
    await expect(
      auth.api.getSession({ headers: secondAppareil })
    ).resolves.toMatchObject({ user: { email } })
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(2)

    await auth.api.sendVerificationOTP({
      body: { email, type: "forget-password" },
    })
    const code = codesEnvoyes.get(email)
    expect(code).toBeTypeOf("string")

    const reinitialisation = await auth.api.resetPasswordEmailOTP({
      body: { email, otp: code!, password: NOUVEAU_MOT_DE_PASSE },
    })
    expect(reinitialisation.success).toBe(true)

    await expect(
      auth.api.getSession({ headers: premierAppareil })
    ).resolves.toBeNull()
    await expect(
      auth.api.getSession({ headers: secondAppareil })
    ).resolves.toBeNull()
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0)

    // L'ancien mot de passe ne rouvre plus rien.
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
  })
})
