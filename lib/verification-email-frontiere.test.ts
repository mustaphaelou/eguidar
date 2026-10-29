import { describe, expect, it } from "vitest"

import { lire } from "@/lib/use-cases/outils-frontiere"

const ROUTES_OTP =
  "../node_modules/better-auth/dist/plugins/email-otp/routes.mjs"

const PROMOTION_CONNEXION = "updateUser(user.user.id, { emailVerified: true })"

function corpsDeRoute(source: string, chemin: string): string {
  const debut = source.indexOf(`createAuthEndpoint("${chemin}"`)
  if (debut === -1) {
    throw new Error(`route absente de la bibliothèque : ${chemin}`)
  }
  const suivant = source.indexOf("createAuthEndpoint(", debut + 1)
  return source.slice(debut, suivant === -1 ? undefined : suivant)
}

describe("Vérification de l'e-mail — les garanties tenues hors du dépôt", () => {
  it("révoque l'accès non prouvé avant de promouvoir sur la Connexion par code", () => {
    const source = lire(import.meta.url, ROUTES_OTP)
    const corps = corpsDeRoute(source, "/sign-in/email-otp")

    expect(corps).toContain(PROMOTION_CONNEXION)

    const revocation = corps.indexOf("revokeUnprovenAccountAccess(")
    expect(revocation, "appel de révocation absent").toBeGreaterThan(-1)
    expect(revocation).toBeLessThan(corps.indexOf(PROMOTION_CONNEXION))
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
