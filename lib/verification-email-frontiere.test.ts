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
      emailAndPassword?: { onExistingUserSignUp?: unknown }
    }
    expect(options.emailVerification?.beforeEmailVerification).toBeUndefined()
    expect(options.emailAndPassword?.onExistingUserSignUp).toBeTypeOf(
      "function"
    )

    const source = lire(import.meta.url, "../lib/auth.ts")
    expect(source).not.toMatch(/revoquerAccesNonProuve|beforeEmailVerification/)
    expect(source).not.toMatch(/prisma\.(account|session)\.delete/)
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

const SCHEMA_PRISMA = "../prisma/schema.prisma"

const INVARIANT_IDENTIFIANT_NON_UNIQUE =
  "l'identifiant de la Vérification de l'e-mail reste non unique : un envoi insère une ligne, une lecture retient la plus récente et une consommation supprime toutes les lignes de l'identifiant ; une contrainte unique empêcherait un second envoi et refuserait de s'appliquer à une base qui porte déjà deux lignes du même identifiant"

function corpsDeVerification(schema: string): string | null {
  const debut = schema.search(/^model\s+verification\s*\{/m)
  if (debut === -1) return null

  const ouverture = schema.indexOf("{", debut)
  const fermeture = schema.indexOf("\n}", ouverture)
  if (ouverture === -1 || fermeture === -1) return null

  return schema.slice(ouverture + 1, fermeture)
}

function corpsSansCommentaires(corps: string): string {
  return corps
    .split("\n")
    .filter((ligne) => !ligne.trim().startsWith("//"))
    .join("\n")
}

const UNIQUE_DE_CHAMP = /^\s*identifier\s+String[^\n]*@unique\b/m

const UNIQUE_DE_MODELE = [
  /@@unique\s*\(\s*\[\s*identifier\s*\]/,
  /@@unique\s*\([^)]*\bfields\s*:\s*\[\s*identifier\s*\]/,
] as const

function violationsDeLIdentifiantUnique(schema: string): string[] {
  const corps = corpsDeVerification(schema)
  if (corps === null) {
    return [
      `le modèle « verification » ne figure plus dans le schéma : ${INVARIANT_IDENTIFIANT_NON_UNIQUE}`,
    ]
  }

  const declarations = corpsSansCommentaires(corps)
  const violations: string[] = []
  if (UNIQUE_DE_CHAMP.test(declarations)) {
    violations.push(
      `le schéma déclare « verification.identifier » en « @unique » : ${INVARIANT_IDENTIFIANT_NON_UNIQUE}`
    )
  }
  if (UNIQUE_DE_MODELE.some((unique) => unique.test(declarations))) {
    violations.push(
      `le schéma déclare le modèle « verification » unique sur « identifier » : ${INVARIANT_IDENTIFIANT_NON_UNIQUE}`
    )
  }
  return violations
}

describe("L'identifiant de la Vérification de l'e-mail reste non unique", () => {
  it("ne porte aucune contrainte unique dans le schéma Prisma", () => {
    expect(
      violationsDeLIdentifiantUnique(lire(import.meta.url, SCHEMA_PRISMA))
    ).toEqual([])
  })

  it("tombe sur une contrainte unique de champ écrite dans le schéma réel", () => {
    const schema = lire(import.meta.url, SCHEMA_PRISMA)
    const avecUnique = schema.replace(
      "\n  identifier String\n",
      "\n  identifier String @unique\n"
    )

    expect(avecUnique).not.toBe(schema)
    expect(violationsDeLIdentifiantUnique(avecUnique)).toEqual([
      `le schéma déclare « verification.identifier » en « @unique » : ${INVARIANT_IDENTIFIANT_NON_UNIQUE}`,
    ])
  })

  it("tombe sur une contrainte unique de modèle écrite dans le schéma réel", () => {
    const schema = lire(import.meta.url, SCHEMA_PRISMA)
    const avecUnique = schema.replace(
      "\n  @@index([identifier])",
      "\n  @@unique([identifier])\n  @@index([identifier])"
    )

    expect(avecUnique).not.toBe(schema)
    expect(violationsDeLIdentifiantUnique(avecUnique)).toEqual([
      `le schéma déclare le modèle « verification » unique sur « identifier » : ${INVARIANT_IDENTIFIANT_NON_UNIQUE}`,
    ])
  })

  it("tombe sur une contrainte unique nommée écrite dans le schéma réel", () => {
    const schema = lire(import.meta.url, SCHEMA_PRISMA)
    const avecUnique = schema.replace(
      "\n  @@index([identifier])",
      "\n  @@unique(fields: [identifier])\n  @@index([identifier])"
    )

    expect(avecUnique).not.toBe(schema)
    expect(violationsDeLIdentifiantUnique(avecUnique)).toEqual([
      `le schéma déclare le modèle « verification » unique sur « identifier » : ${INVARIANT_IDENTIFIANT_NON_UNIQUE}`,
    ])
  })
})
