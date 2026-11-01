import { randomBytes, randomUUID, scryptSync } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Le limiteur par adresse de Better Auth n'est actif qu'en production
// (`enabled: isProduction`). Ce fichier force l'environnement pour prouver que
// la seconde ligne ne l'a pas remplacé ; afterAll le restaure.
const environnementInitial = vi.hoisted(() => {
  const env = process.env as Record<string, string | undefined>
  const initial = env.NODE_ENV
  env.NODE_ENV = "production"
  process.env.BETTER_AUTH_URL = "http://localhost:3000"
  return initial
})

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import {
  cleEchecsConnexion,
  CODE_COMPTE_TEMPORAIREMENT_VERROUILLE,
  ECHEANCES_MAX_CONNEXIONS_ECHOUEES,
  FENETRE_ECHEANCES_CONNEXION_MS,
} from "@/lib/echecs-connexion-regles"
import { getRedis } from "@/lib/redis"
import { fauxServiceDeFuite } from "@/test/faux-service-de-fuite"

const runId = randomUUID().slice(0, 8)
const email = `echecs-connexion-${runId}@test.ma`
const MOT_DE_PASSE = "MotDePasse!12345"
const MAUVAIS_MOT_DE_PASSE = "MauvaisMotDePasse!15"

function hacheLegacy(motDePasse: string): string {
  const sel = randomBytes(16).toString("hex")
  const cle = scryptSync(motDePasse.normalize("NFKC"), sel, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  })
  return `${sel}:${cle.toString("hex")}`
}

async function refus(promesse: Promise<unknown>): Promise<{
  code?: string
  statusCode?: number
}> {
  try {
    await promesse
  } catch (error) {
    const { body, statusCode } = error as {
      body?: { code?: string }
      statusCode?: number
    }
    return { code: body?.code, statusCode }
  }
  throw new Error("attendu : un refus de la bibliothèque")
}

function entetesAdresse(adresse: string): Headers {
  return new Headers({ "x-forwarded-for": adresse })
}

async function connexionHttp(
  adresseEmail: string,
  motDePasse: string,
  ip: string
): Promise<Response> {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email: adresseEmail, password: motDePasse }),
    })
  )
}

async function effacerLeCompteur(adresseEmail: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  if (!redis.isOpen) await redis.connect()
  await redis.del(cleEchecsConnexion(adresseEmail))
}

beforeAll(async () => {
  vi.stubGlobal("fetch", fauxServiceDeFuite([]))

  const id = randomUUID()
  await prisma.user.create({
    data: { id, name: "Client ciblé", email, emailVerified: true },
  })
  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hacheLegacy(MOT_DE_PASSE),
    },
  })
  await effacerLeCompteur(email)
})

afterAll(async () => {
  const env = process.env as Record<string, string | undefined>
  if (environnementInitial === undefined) delete env.NODE_ENV
  else env.NODE_ENV = environnementInitial
  vi.unstubAllGlobals()
  await effacerLeCompteur(email)
  await effacerLeCompteur(`limiteur-adresse-${runId}@test.ma`)
  await prisma.verification.deleteMany({
    where: { identifier: { contains: `echecs-connexion-${runId}` } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: `echecs-connexion-${runId}` } },
  })
  await prisma.$disconnect()
  const redis = getRedis()
  if (redis?.isOpen) await redis.quit()
})

async function redisDeTest() {
  const redis = getRedis()!
  if (!redis.isOpen) await redis.connect()
  return redis
}

describe("Connexion par mot de passe — compteur d'échecs par adresse", () => {
  it("refuse la Connexion après le seuil, même avec le bon mot de passe", async () => {
    for (
      let tentative = 0;
      tentative < ECHEANCES_MAX_CONNEXIONS_ECHOUEES;
      tentative++
    ) {
      const echec = await refus(
        auth.api.signInEmail({
          body: { email, password: MAUVAIS_MOT_DE_PASSE },
          headers: entetesAdresse(`198.51.100.${tentative + 1}`),
        })
      )
      expect(echec.code).toBe("INVALID_EMAIL_OR_PASSWORD")
    }

    const redis = await redisDeTest()
    const ttl = await redis.pTTL(cleEchecsConnexion(email))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(FENETRE_ECHEANCES_CONNEXION_MS)

    const verrouille = await refus(
      auth.api.signInEmail({
        body: { email, password: MOT_DE_PASSE },
        headers: entetesAdresse("198.51.100.99"),
      })
    )
    expect(verrouille.code).toBe(CODE_COMPTE_TEMPORAIREMENT_VERROUILLE)
    expect(verrouille.statusCode).toBe(429)
  })

  it("le verrou s'efface tout seul après le TTL", async () => {
    const redis = await redisDeTest()
    await redis.set(
      cleEchecsConnexion(email),
      String(ECHEANCES_MAX_CONNEXIONS_ECHOUEES)
    )
    await redis.pExpire(cleEchecsConnexion(email), 50)

    const bloque = await refus(
      auth.api.signInEmail({
        body: { email, password: MOT_DE_PASSE },
        headers: entetesAdresse("198.51.100.98"),
      })
    )
    expect(bloque.code).toBe(CODE_COMPTE_TEMPORAIREMENT_VERROUILLE)

    await new Promise((resolve) => setTimeout(resolve, 120))

    const connexion = await auth.api.signInEmail({
      body: { email, password: MOT_DE_PASSE },
      headers: entetesAdresse("198.51.100.100"),
    })
    expect(connexion.user.email).toBe(email)
  })

  it("compte les adresses normalisées sous une seule clé", async () => {
    const redis = await redisDeTest()
    await effacerLeCompteur(email)

    expect(cleEchecsConnexion(` ${email.toUpperCase()} `)).toBe(
      cleEchecsConnexion(email)
    )

    for (let tentative = 0; tentative < 3; tentative++) {
      await refus(
        auth.api.signInEmail({
          body: { email: email.toUpperCase(), password: MAUVAIS_MOT_DE_PASSE },
          headers: entetesAdresse(`203.0.114.${tentative + 1}`),
        })
      )
    }

    expect(await redis.get(cleEchecsConnexion(email))).toBe("3")
  })

  it("une Connexion réussie remet le compteur à zéro", async () => {
    const redis = getRedis()!
    if (!redis.isOpen) await redis.connect()
    await effacerLeCompteur(email)

    for (let tentative = 0; tentative < 3; tentative++) {
      await refus(
        auth.api.signInEmail({
          body: { email, password: MAUVAIS_MOT_DE_PASSE },
          headers: entetesAdresse(`203.0.113.${tentative + 1}`),
        })
      )
    }
    expect(await redis.get(cleEchecsConnexion(email))).toBe("3")

    await auth.api.signInEmail({
      body: { email, password: MOT_DE_PASSE },
      headers: entetesAdresse("203.0.113.99"),
    })

    expect(await redis.get(cleEchecsConnexion(email))).toBeNull()
  })

  it("le limiteur par adresse reste la première ligne", async () => {
    const adresseInconnue = `limiteur-adresse-${runId}@test.ma`
    const ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}`

    for (let tentative = 0; tentative < 3; tentative++) {
      const reponse = await connexionHttp(
        adresseInconnue,
        "Mauvais!123456789",
        ip
      )
      expect(reponse.status).toBe(401)
    }

    const refusee = await connexionHttp(
      adresseInconnue,
      "Mauvais!123456789",
      ip
    )
    expect(refusee.status).toBe(429)
  })
})
