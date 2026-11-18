import {
  DUREE_VIE_COOKIE_MOYEN_DE_CONNEXION_SECONDES,
  NOM_COOKIE_MOYEN_DE_CONNEXION,
} from "../lib/moyen-de-connexion"
import { expect, test } from "./fixtures/sonde"
import { adresseDeConnexion, identifiantsDeLaSonde } from "./harnais/session"

const PHRASE_MOT_DE_PASSE =
  "Dernière connexion sur cet appareil : e-mail et mot de passe."

test("la modale nomme le Moyen de connexion de la dernière Connexion de cet appareil", async ({
  page,
  serveur,
}) => {
  const identifiants = identifiantsDeLaSonde()
  const adresseDeLaModale = `${serveur.origine}/faq?open=login`

  await page.goto(adresseDeLaModale, { waitUntil: "domcontentloaded" })
  await expect(page.getByText(PHRASE_MOT_DE_PASSE)).toHaveCount(0)

  const connexion = await page.evaluate(
    async ({ adresse, email, motDePasse }) => {
      const reponse = await fetch(adresse, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: motDePasse }),
      })
      return { statut: reponse.status, corps: await reponse.text() }
    },
    {
      adresse: adresseDeConnexion(serveur.origine),
      email: identifiants.email,
      motDePasse: identifiants.motDePasse,
    }
  )
  expect(connexion.statut, connexion.corps).toBe(200)

  const cookie = (await page.context().cookies()).find(
    (candidat) => candidat.name === NOM_COOKIE_MOYEN_DE_CONNEXION
  )
  expect(cookie).toBeDefined()
  expect(cookie!.value).toBe("mot-de-passe")
  expect(cookie!.httpOnly).toBe(false)
  expect(cookie!.path).toBe("/")
  expect(cookie!.domain).toBe(new URL(serveur.origine).hostname)
  const echeanceAttendue =
    Date.now() / 1000 + DUREE_VIE_COOKIE_MOYEN_DE_CONNEXION_SECONDES
  expect(cookie!.expires).toBeGreaterThan(echeanceAttendue - 120)
  expect(cookie!.expires).toBeLessThanOrEqual(echeanceAttendue + 120)

  const deconnexion = await page.evaluate(async (origine) => {
    const reponse = await fetch(new URL("/api/auth/sign-out", origine), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    return reponse.status
  }, serveur.origine)
  expect(deconnexion).toBe(200)

  const cookiesApresDeconnexion = await page.context().cookies()
  expect(
    cookiesApresDeconnexion.some(
      (candidat) =>
        candidat.name === NOM_COOKIE_MOYEN_DE_CONNEXION &&
        candidat.value === "mot-de-passe"
    )
  ).toBe(true)

  await page.goto(adresseDeLaModale, { waitUntil: "domcontentloaded" })
  await expect(page.getByText(PHRASE_MOT_DE_PASSE)).toBeVisible()
})
