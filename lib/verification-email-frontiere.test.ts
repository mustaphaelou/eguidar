import { describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"
import { lire } from "@/lib/use-cases/outils-frontiere"

const ROUTES_OTP =
  "../node_modules/better-auth/dist/plugins/email-otp/routes.mjs"

const REVOCATION_NON_PROUVE =
  "../node_modules/better-auth/dist/db/revoke-unproven-account-access.mjs"

const PROMOTION_CONNEXION = "updateUser(userId, { emailVerified: true })"

function corpsDeRoute(source: string, chemin: string): string {
  const debut = source.indexOf(`createAuthEndpoint("${chemin}"`)
  if (debut === -1) {
    throw new Error(`route absente de la bibliothèque : ${chemin}`)
  }
  const suivant = source.indexOf("createAuthEndpoint(", debut + 1)
  return source.slice(debut, suivant === -1 ? undefined : suivant)
}

describe("Connexion par code et Connexion sociale — les garanties tenues hors du dépôt", () => {
  it("révoque l'accès non prouvé avant de promouvoir sur la Connexion par code", () => {
    const source = lire(import.meta.url, ROUTES_OTP)
    const corps = corpsDeRoute(source, "/sign-in/email-otp")

    const revocation = corps.indexOf(
      "revokeUnprovenAccountAccess(ctx, verifiedUser.id)"
    )
    expect(revocation, "appel de révocation absent").toBeGreaterThan(-1)

    const ouverture = corps.indexOf("createSession(verifiedUser.id)")
    expect(ouverture, "ouverture de session absente").toBeGreaterThan(-1)
    expect(revocation).toBeLessThan(ouverture)

    const revocationSource = lire(import.meta.url, REVOCATION_NON_PROUVE)
    const comptes = revocationSource.indexOf("deleteAccount(account.id)")
    const sessions = revocationSource.indexOf("deleteUserSessions(userId)")
    const promotion = revocationSource.indexOf(PROMOTION_CONNEXION)

    expect(comptes, "suppression des comptes absente").toBeGreaterThan(-1)
    expect(sessions, "suppression des sessions absente").toBeGreaterThan(-1)
    expect(promotion, "promotion absente").toBeGreaterThan(-1)
    expect(promotion).toBeGreaterThan(comptes)
    expect(promotion).toBeGreaterThan(sessions)
  })

  it("ne rebranche aucune révocation maison sur la Vérification de l'e-mail", () => {
    const options = auth.options as unknown as {
      emailVerification?: { beforeEmailVerification?: unknown }
    }
    expect(options.emailVerification?.beforeEmailVerification).toBeUndefined()

    const source = lire(import.meta.url, "../lib/auth.ts")
    expect(source).not.toMatch(
      /revoquerAccesNonProuve|revokeUnprovenAccountAccess/
    )
  })

  it("la Connexion sociale refuse de relier un Compte client non vérifié", () => {
    const liaison = lire(
      import.meta.url,
      "../node_modules/better-auth/dist/oauth2/link-account.mjs"
    )

    expect(liaison).toMatch(
      /requireLocalEmailVerified = accountLinking\?\.requireLocalEmailVerified \?\? true/
    )
    expect(liaison).toMatch(
      /requireLocalEmailVerified && !dbUser\.user\.emailVerified/
    )
  })
})
