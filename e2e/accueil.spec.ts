import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { expect, test } from "./fixtures/sonde"

/**
 * Le premier cas de la sonde, volontairement trivial : prouver le tuyau —
 * artefact construit, base dédiée, serveur, Chromium — avant de lui confier
 * les faits de la boutique.
 */
test.describe("l'accueil de la boutique", () => {
  test("se rend de bout en bout à 390 × 844", async ({ page, serveur }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 })

    const erreursDePage: string[] = []
    page.on("pageerror", (erreur) => erreursDePage.push(erreur.message))

    // La coquille cliente lit le Panier après hydratation : cette réponse est
    // le signal que React a repris la page, armé avant la navigation.
    const montageDuPanier = attendreLeCompteurDuPanier(page)
    const reponse = await page.goto(`${serveur.origine}/`, {
      waitUntil: "domcontentloaded",
    })
    expect(reponse?.status()).toBe(200)

    await attendreLaPagePrete(page, montageDuPanier)

    // L'hydratation a eu lieu, les polices sont posées, la page a un contenu.
    expect(await page.evaluate(() => document.fonts.status)).toBe("loaded")
    await expect(page.locator("main")).toBeVisible()
    await expect(page.locator("main")).not.toBeEmpty()
    expect(await page.title()).not.toBe("")

    // Le format de la sonde ne déborde pas de lui-même.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390)
    expect(erreursDePage).toEqual([])
  })
})
