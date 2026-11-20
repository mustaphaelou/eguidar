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
import { NOM_COOKIE_MOYEN_DE_CONNEXION } from "@/lib/moyen-de-connexion"
import { fauxServiceDeFuite } from "@/test/faux-service-de-fuite"

const runId = randomUUID().slice(0, 8)
const prefixe = `moyen-ecritures-${runId}`
const motDePasse = "MotDePasse!8181"

function adresse(nom: string) {
  return `${prefixe}-${nom}@test.ma`
}

function codeEnvoye(adresseEmail: string) {
  const code = codesEnvoyes.get(adresseEmail.toLowerCase())
  expect(code, `le code envoyé à ${adresseEmail}`).toBeTypeOf("string")
  return code!
}

function valeurDuCookieNomme(
  reponse: Response,
  nom: string
): string | undefined {
  const brut = reponse.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${nom}=`))
  if (brut === undefined) return undefined
  const [paire] = brut.split(";")
  return paire.slice(paire.indexOf("=") + 1)
}

function moyenDeConnexionEcrit(reponse: Response): string | undefined {
  return valeurDuCookieNomme(reponse, NOM_COOKIE_MOYEN_DE_CONNEXION)
}

function entetesDeSession(entetes: Headers): Headers {
  const cookie = entetes
    .getSetCookie()
    .map((brut) => brut.split(";")[0])
    .join("; ")
  return new Headers({ cookie })
}

async function sessionOuverte(reponse: Response) {
  return auth.api.getSession({ headers: entetesDeSession(reponse.headers) })
}

async function inscrire(email: string) {
  await auth.api.signUpEmail({
    body: { email, password: motDePasse, name: "Client écritures" },
  })
}

async function verifierEmail(email: string): Promise<Response> {
  await auth.api.sendVerificationOTP({
    body: { email, type: "email-verification" },
  })
  return auth.api.verifyEmailOTP({
    body: { email, otp: codeEnvoye(email) },
    asResponse: true,
  })
}

beforeAll(() => {
  vi.stubGlobal("fetch", fauxServiceDeFuite([]))
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await prisma.verification.deleteMany({
    where: { identifier: { contains: prefixe } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: prefixe } },
  })
  await prisma.$disconnect()
})

describe("Les écritures du Moyen de connexion", () => {
  it("écrit mot-de-passe sous le nom du cookie de la boutique à la Connexion par mot de passe", async () => {
    const email = adresse("mot-de-passe")
    await inscrire(email)
    await verifierEmail(email)

    const connexion = await auth.api.signInEmail({
      body: { email, password: motDePasse },
      asResponse: true,
    })

    expect(connexion.status).toBe(200)
    expect(await sessionOuverte(connexion)).toMatchObject({ user: { email } })
    expect(moyenDeConnexionEcrit(connexion)).toBe("mot-de-passe")
  })

  it("n'écrit aucun Moyen de connexion à la Connexion par code, qui ouvre pourtant une Session", async () => {
    const email = adresse("code")
    await inscrire(email)
    await verifierEmail(email)

    await auth.api.sendVerificationOTP({
      body: { email, type: "sign-in" },
    })
    const connexion = await auth.api.signInEmailOTP({
      body: { email, otp: codeEnvoye(email) },
      asResponse: true,
    })

    expect(connexion.status).toBe(200)
    expect(
      await sessionOuverte(connexion),
      "la Connexion par code ouvre la Session"
    ).toMatchObject({ user: { email } })
    expect(moyenDeConnexionEcrit(connexion)).toBeUndefined()
  })

  it("n'écrit aucun Moyen de connexion à l'Inscription", async () => {
    const inscription = await auth.api.signUpEmail({
      body: {
        email: adresse("inscription"),
        password: motDePasse,
        name: "Client inscription",
      },
      asResponse: true,
    })

    expect(inscription.status).toBe(200)
    expect(moyenDeConnexionEcrit(inscription)).toBeUndefined()
  })

  it("n'écrit aucun Moyen de connexion à la Vérification de l'e-mail, qui ouvre pourtant une Session", async () => {
    const email = adresse("verification")
    await inscrire(email)
    const verification = await verifierEmail(email)

    expect(verification.status).toBe(200)
    expect(
      await sessionOuverte(verification),
      "la Vérification de l'e-mail ouvre la Session"
    ).toMatchObject({ user: { email } })
    expect(moyenDeConnexionEcrit(verification)).toBeUndefined()
  })
})
