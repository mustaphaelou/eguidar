import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { expect, test } from "./fixtures/sonde"

test.describe("l'accueil de la boutique", () => {
  test("se rend de bout en bout à 390 × 844", async ({ page, serveur }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 })

    const erreursDePage: string[] = []
    page.on("pageerror", (erreur) => erreursDePage.push(erreur.message))

    const montageDuPanier = attendreLeCompteurDuPanier(page)
    const reponse = await page.goto(`${serveur.origine}/`, {
      waitUntil: "domcontentloaded",
    })
    expect(reponse?.status()).toBe(200)

    await attendreLaPagePrete(page, montageDuPanier)

    expect(await page.evaluate(() => document.fonts.status)).toBe("loaded")
    await expect(page.locator("main")).toBeVisible()
    await expect(page.locator("main")).not.toBeEmpty()
    expect(await page.title()).not.toBe("")

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390)
    expect(erreursDePage).toEqual([])
  })
})
