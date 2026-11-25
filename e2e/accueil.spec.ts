import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { expect, test } from "./fixtures/sonde"

const LARGEURS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const

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

  for (const viewport of LARGEURS) {
    test.describe(`sans débordement à ${viewport.width} × ${viewport.height}`, () => {
      test.use({ viewport })

      test("ne déborde jamais horizontalement", async ({ page, serveur }) => {
        const montageDuPanier = attendreLeCompteurDuPanier(page)
        const reponse = await page.goto(`${serveur.origine}/`, {
          waitUntil: "domcontentloaded",
        })
        expect(reponse?.status()).toBe(200)
        await attendreLaPagePrete(page, montageDuPanier)

        expect(
          await page.evaluate(() => document.documentElement.scrollWidth)
        ).toBeLessThanOrEqual(viewport.width)
      })
    })
  }

  test.describe("la bande des catégories sur ordinateur", () => {
    test.use({
      viewport: { width: 1280, height: 800 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    })

    test("aligne tous les appels « Découvrir » sur une seule ligne de base grâce à subgrid", async ({
      page,
      serveur,
    }) => {
      const montageDuPanier = attendreLeCompteurDuPanier(page)
      await page.goto(`${serveur.origine}/`, { waitUntil: "domcontentloaded" })
      await attendreLaPagePrete(page, montageDuPanier)

      const bande = page.locator("[data-reveal-etat]").filter({
        has: page.getByRole("heading", { name: "Toutes nos catégories" }),
      })
      await bande.scrollIntoViewIfNeeded()

      const appels = bande.getByText("Découvrir", { exact: true })
      await expect(appels).toHaveCount(6)

      const ordonnees: number[] = []
      for (let i = 0; i < 6; i++) {
        const boite = await appels.nth(i).boundingBox()
        expect(boite).not.toBeNull()
        ordonnees.push(boite!.y)
      }

      const min = Math.min(...ordonnees)
      const max = Math.max(...ordonnees)
      expect(max - min).toBeLessThanOrEqual(1)
    })
  })
})
