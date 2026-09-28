import { describe, expect, it } from "vitest"

import { auth } from "@/lib/auth"
import { lire } from "@/lib/use-cases/outils-frontiere"

/**
 * Frontière de la Vérification de l'e-mail : l'accès non-prouvé.
 *
 * Un Compte client dont l'e-mail n'est pas vérifié ne prouve pas que le mot de
 * passe posé dessus appartient au propriétaire de la boîte. La bibliothèque
 * promeut la ligne sans rien révoquer — `/email-otp/verify-email` ne fait que
 * poser `emailVerified: true` sur la ligne trouvée par e-mail — donc la règle
 * est tenue par l'application, avant la promotion.
 *
 * Elle l'est par `emailVerification.beforeEmailVerification` et non par
 * `databaseHooks.user.update.before`, qui ne reçoit jamais l'identifiant de la
 * ligne visée : `with-hooks.mjs` passe le `where` à l'adaptateur, pas au hook.
 * Le port de `revocation-acces-non-prouve` est donc indexé sur l'identifiant que
 * ce hook fournit, et son adaptateur travaille en Prisma direct pour ne pas se
 * redéclencher.
 *
 * Ce fichier est le verrou. Il échoue bruyamment si la couture disparaît, si la
 * bibliothèque cesse de l'appeler, ou si elle l'appelle après la promotion au
 * lieu d'avant — une rupture y serait muette, le dépôt n'ayant rien à faire
 * échouer de lui-même.
 */
const ROUTES_OTP =
  "../node_modules/better-auth/dist/plugins/email-otp/routes.mjs"
const ROUTE_JETON =
  "../node_modules/better-auth/dist/api/routes/email-verification.mjs"

/**
 * La promotion que chaque route fait, et rien d'autre. Les trois formes sont
 * distinctes : deux routes écrivent l'e-mail dans la mise à jour, `/sign-in/
 * email-otp` non, et les confondre laisserait passer une route qui promeut.
 */
const PROMOTION_VERIFICATION =
  "updateUser(user.user.id, {\n\t\temail,\n\t\temailVerified: true\n\t})"
const PROMOTION_CHANGEMENT =
  "updateUser(currentUser.user.id, {\n\t\temail: newEmail,\n\t\temailVerified: true\n\t})"
const PROMOTION_JETON =
  "updateUserByEmail(parsed.email, { emailVerified: true })"
const PROMOTION_CONNEXION = "updateUser(user.user.id, { emailVerified: true })"

/**
 * Le corps d'une route de la bibliothèque : de sa déclaration
 * `createAuthEndpoint` à la suivante, pour que la garde regarde la route qu'elle
 * vise et pas le fichier entier. Le même fichier contient une route qui promeut
 * sans jamais passer par la couture ; une garde qui parcours tout le texte ne
 * pourrait pas les distinguer.
 */
function corpsDeRoute(source: string, chemin: string): string {
  const debut = source.indexOf(`createAuthEndpoint("${chemin}"`)
  if (debut === -1) {
    throw new Error(`route absente de la bibliothèque : ${chemin}`)
  }
  const suivant = source.indexOf("createAuthEndpoint(", debut + 1)
  return source.slice(debut, suivant === -1 ? undefined : suivant)
}

/**
 * La route appelle-t-elle la couture *avant* de promouvoir la ligne ? L'ordre
 * est la règle : révoquer après la promotion ne trouve plus qu'une ligne déjà
 * vérifiée, la garde fait no-op, et le mot de passe posé par un tiers survit à
 * la preuve.
 */
function revoqueAvantPromotion(corps: string, promotion: string): boolean {
  const couture = corps.indexOf("beforeEmailVerification(")
  const ligne = corps.indexOf(promotion)
  return couture !== -1 && ligne !== -1 && couture < ligne
}

describe("Vérification de l'e-mail — l'accès non-prouvé", () => {
  it("l'application tient la règle, par la couture qui connaît la ligne visée", () => {
    // Parcours non vacuant : l'option est enregistrée sur l'instance, pas
    // seulement écrite dans la source.
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

    // Et la couture appelle la règle par l'adaptateur de production, dont les
    // suppressions passent par Prisma direct.
    const source = lire(import.meta.url, "./auth.ts")

    expect(source).toMatch(/revoquerAccesNonProuve\(\s*accesCompteClientPrisma/)
  })

  it("aucune promotion de la bibliothèque n'échappe à la couture", () => {
    const otp = lire(import.meta.url, ROUTES_OTP)
    const jeton = lire(import.meta.url, ROUTE_JETON)

    // Les trois routes de promotion, chacune avec la promotion qu'elle fait.
    // Toutes doivent passer par la couture, avant.
    const promotions: [string, string, string][] = [
      [otp, "/email-otp/verify-email", PROMOTION_VERIFICATION],
      [jeton, "/verify-email", PROMOTION_JETON],
      [otp, "/email-otp/change-email", PROMOTION_CHANGEMENT],
    ]

    for (const [source, chemin, promotion] of promotions) {
      const corps = corpsDeRoute(source, chemin)

      // Parcours non vacuant : la route promeut bien, et par la forme attendue.
      expect(corps, chemin).toContain(promotion)
      expect(revoqueAvantPromotion(corps, promotion), chemin).toBe(true)
    }
  })

  it("la garde distingue une route qui passe par la couture d'une route qui promeut seule", () => {
    const otp = lire(import.meta.url, ROUTES_OTP)

    // Contre-exemple réel, dans le même fichier : la Connexion par OTP promeut
    // aussi, mais ne passe pas par la couture — elle porte sa propre révocation,
    // en ligne. Elle prouve que la garde ne passe pas sur la seule présence
    // d'une promotion, ni sur la seule présence de la promotion OTP.
    const connexionParOtp = corpsDeRoute(otp, "/sign-in/email-otp")

    expect(connexionParOtp).toContain(PROMOTION_CONNEXION)
    expect(connexionParOtp).not.toContain(PROMOTION_VERIFICATION)
    expect(revoqueAvantPromotion(connexionParOtp, PROMOTION_CONNEXION)).toBe(
      false
    )
    // Sa révocation est bien là, et bien avant la promotion.
    expect(
      connexionParOtp.indexOf("revokeUnprovenAccountAccess(")
    ).toBeLessThan(connexionParOtp.indexOf(PROMOTION_CONNEXION))

    // Contre-exemple d'ordre : une couture rappelée après la promotion ne
    // révoque plus rien.
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

    // Le vocabulaire `"credential"` est celui de la bibliothèque et n'est typé
    // nulle part : un comparatif de chaîne ne se vérifie pas à la compilation,
    // donc la garde le lit dans la source au lieu de le réécrire.
    expect(source).toMatch(/providerId === "credential"/)
    expect(source).toMatch(/prisma\.account\.delete\(/)
    expect(source).toMatch(/prisma\.session\.deleteMany\(/)
    // Une ligne déjà vérifiée, ou inconnue, est un no-op strict : la double
    // promotion converge.
    expect(source).toMatch(/if \(!compte \|\| compte\.emailVerified\) return/)
  })

  it("la Connexion sociale refuse de relier un Compte client non vérifié", () => {
    // L'autre moignon de la même règle : une Connexion sociale qui résout vers
    // une ligne non vérifiée ne se relie pas, elle échoue — l'héritier de la
    // preuve n'y gagne donc aucun accès à hériter. Verrouillé sur la source de
    // la bibliothèque ; `auth-connexion-sociale.test.ts` verrouille de l'autre
    // côté que la configuration du dépôt laisse ce défaut de valeur en place.
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
