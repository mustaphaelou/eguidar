import { describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"
import { lire } from "@/lib/use-cases/outils-frontiere"

const ROUTES_OTP =
  "../node_modules/better-auth/dist/plugins/email-otp/routes.mjs"
const ROUTE_JETON =
  "../node_modules/better-auth/dist/api/routes/email-verification.mjs"

const PROMOTION_VERIFICATION =
  "updateUser(user.user.id, {\n\t\temail,\n\t\temailVerified: true\n\t})"
const PROMOTION_CHANGEMENT =
  "updateUser(currentUser.user.id, {\n\t\temail: newEmail,\n\t\temailVerified: true\n\t})"
const PROMOTION_JETON =
  "updateUserByEmail(parsed.email, { emailVerified: true })"
const PROMOTION_CONNEXION = "updateUser(user.user.id, { emailVerified: true })"

function corpsDeRoute(source: string, chemin: string): string {
  const debut = source.indexOf(`createAuthEndpoint("${chemin}"`)
  if (debut === -1) {
    throw new Error(`route absente de la bibliothèque : ${chemin}`)
  }
  const suivant = source.indexOf("createAuthEndpoint(", debut + 1)
  return source.slice(debut, suivant === -1 ? undefined : suivant)
}

function revoqueAvantPromotion(corps: string, promotion: string): boolean {
  const couture = corps.indexOf("beforeEmailVerification(")
  const ligne = corps.indexOf(promotion)
  return couture !== -1 && ligne !== -1 && couture < ligne
}

describe("Vérification de l'e-mail — l'accès non-prouvé", () => {
  it("l'application tient la règle, par la couture qui connaît la ligne visée", () => {
    const couture = (
      auth.options as unknown as {
        emailVerification?: {
          beforeEmailVerification?: (compteClient: {
            id: string
          }) => Promise<void>
        }
      }
    ).emailVerification?.beforeEmailVerification

    expect(couture).toBeTypeOf("function")

    const source = lire(import.meta.url, "./auth.ts")

    expect(source).toMatch(/revoquerAccesNonProuve\(\s*accesCompteClientPrisma/)
  })

  it("aucune promotion de la bibliothèque n'échappe à la couture", () => {
    const otp = lire(import.meta.url, ROUTES_OTP)
    const jeton = lire(import.meta.url, ROUTE_JETON)

    const promotions: [string, string, string][] = [
      [otp, "/email-otp/verify-email", PROMOTION_VERIFICATION],
      [jeton, "/verify-email", PROMOTION_JETON],
      [otp, "/email-otp/change-email", PROMOTION_CHANGEMENT],
    ]

    for (const [source, chemin, promotion] of promotions) {
      const corps = corpsDeRoute(source, chemin)

      expect(corps, chemin).toContain(promotion)
      expect(revoqueAvantPromotion(corps, promotion), chemin).toBe(true)
    }
  })

  it("la garde distingue une route qui passe par la couture d'une route qui promeut seule", () => {
    const otp = lire(import.meta.url, ROUTES_OTP)

    const connexionParOtp = corpsDeRoute(otp, "/sign-in/email-otp")

    expect(connexionParOtp).toContain(PROMOTION_CONNEXION)
    expect(connexionParOtp).not.toContain(PROMOTION_VERIFICATION)
    expect(revoqueAvantPromotion(connexionParOtp, PROMOTION_CONNEXION)).toBe(
      false
    )
    expect(
      connexionParOtp.indexOf("revokeUnprovenAccountAccess(")
    ).toBeLessThan(connexionParOtp.indexOf(PROMOTION_CONNEXION))

    expect(
      revoqueAvantPromotion(
        `await ${PROMOTION_VERIFICATION}; await c.beforeEmailVerification(u);`,
        PROMOTION_VERIFICATION
      )
    ).toBe(false)
    expect(
      revoqueAvantPromotion(
        `await ${PROMOTION_VERIFICATION}`,
        PROMOTION_VERIFICATION
      )
    ).toBe(false)
  })

  it("la révocation vise les comptes credential et les sessions, et épargne un compte déjà vérifié", () => {
    const source = lire(import.meta.url, "./revocation-acces-non-prouve.ts")

    expect(source).toMatch(/providerId === "credential"/)
    expect(source).toMatch(/prisma\.account\.delete\(/)
    expect(source).toMatch(/prisma\.session\.deleteMany\(/)
    expect(source).toMatch(/if \(!compte \|\| compte\.emailVerified\) return/)
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
