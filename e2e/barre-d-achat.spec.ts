import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures/sonde"
import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"

const CHEMIN_DE_LA_FICHE = "/produit/iphone-15-pro"

const LARGEURS_DE_TELEPHONE = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const

const DEFILEMENT_APRES_L_ACTION = 1000

function barreDAchat(page: Page): Locator {
  return page.locator("[data-slot='barre-d-achat']").filter({ visible: true })
}

function prixDeLaBarre(page: Page): Locator {
  return barreDAchat(page).locator("p").filter({ hasText: "MAD" }).first()
}

function boutonDeLaBarre(page: Page): Locator {
  return barreDAchat(page).getByRole("button")
}

function actionDAchatDeLaPage(page: Page): Locator {
  return page.getByRole("button", { name: "Ajouter au panier", exact: true })
}

async function ouvrirLaFiche(page: Page, origine: string): Promise<void> {
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${origine}${CHEMIN_DE_LA_FICHE}`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

async function defilerAuDelaDeLActionDAchat(page: Page): Promise<void> {
  await page.mouse.wheel(0, DEFILEMENT_APRES_L_ACTION)
  await expect(actionDAchatDeLaPage(page)).not.toBeInViewport()
  await expect(page.locator("footer")).not.toBeInViewport()
}

test.describe("la Barre d'achat de la fiche Produit", () => {
  test("12. au chargement, la Barre d'achat est absente", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaFiche(page, serveur.origine)

    await expect(actionDAchatDeLaPage(page)).not.toBeInViewport()
    await expect(barreDAchat(page)).toHaveAttribute("aria-hidden", "true")
  })

  test("13. après défilement, la Barre d'achat montre son prix et son bouton", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaFiche(page, serveur.origine)
    await defilerAuDelaDeLActionDAchat(page)

    await expect(barreDAchat(page)).toHaveAttribute("aria-hidden", "false")
    await expect(prixDeLaBarre(page)).toHaveText(/MAD/)
    await expect(boutonDeLaBarre(page)).toBeVisible()
    await expect(boutonDeLaBarre(page)).toHaveAccessibleName(
      /Ajouter au panier/
    )
    await expect(boutonDeLaBarre(page)).toHaveAccessibleName(/128 Go/)
  })

  test("16. devant le Pied de page, la Barre d'achat s'efface", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaFiche(page, serveur.origine)
    await defilerAuDelaDeLActionDAchat(page)
    await expect(barreDAchat(page)).toHaveAttribute("aria-hidden", "false")

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect(page.locator("footer")).toBeInViewport()
    await expect(barreDAchat(page)).toHaveAttribute("aria-hidden", "true")
  })

  test("17. met à jour le nom de la variante visible dans la Barre d'achat", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaFiche(page, serveur.origine)
    await page.getByRole("button", { name: "256 Go", exact: true }).click()
    await defilerAuDelaDeLActionDAchat(page)

    await expect(barreDAchat(page)).toHaveAttribute("aria-hidden", "false")
    await expect(barreDAchat(page)).toContainText("256 Go")
    await expect(boutonDeLaBarre(page)).toHaveAccessibleName(/256 Go/)
  })

  test("18. s'efface sans glissement sous mouvement réduit", async ({
    page,
    serveur,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await ouvrirLaFiche(page, serveur.origine)

    const transform = await barreDAchat(page).evaluate(
      (element) => getComputedStyle(element).translate
    )
    expect(transform).toBe("none")
  })
})

for (const viewport of LARGEURS_DE_TELEPHONE) {
  test.describe(`à ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })

    test("14. le prix et le bouton de la Barre d'achat ne se croisent pas", async ({
      page,
      serveur,
    }) => {
      await ouvrirLaFiche(page, serveur.origine)
      await defilerAuDelaDeLActionDAchat(page)
      await expect(barreDAchat(page)).toHaveAttribute("aria-hidden", "false")

      const prix = await prixDeLaBarre(page).boundingBox()
      const bouton = await boutonDeLaBarre(page).boundingBox()
      expect(prix).not.toBeNull()
      expect(bouton).not.toBeNull()

      expect(prix!.x + prix!.width).toBeLessThanOrEqual(bouton!.x)
      const croisementHorizontal =
        Math.min(prix!.x + prix!.width, bouton!.x + bouton!.width) -
        Math.max(prix!.x, bouton!.x)
      const croisementVertical =
        Math.min(prix!.y + prix!.height, bouton!.y + bouton!.height) -
        Math.max(prix!.y, bouton!.y)
      expect(croisementHorizontal > 0 && croisementVertical > 0).toBe(false)
    })

    test("15. le prix de la Barre d'achat tient sur une ligne", async ({
      page,
      serveur,
    }) => {
      await ouvrirLaFiche(page, serveur.origine)
      await defilerAuDelaDeLActionDAchat(page)
      await expect(barreDAchat(page)).toHaveAttribute("aria-hidden", "false")

      const lignes = await prixDeLaBarre(page).evaluate((element) => {
        const plage = document.createRange()
        plage.selectNodeContents(element)
        return [...plage.getClientRects()].filter(
          (rectangle) => rectangle.width > 0 && rectangle.height > 0
        ).length
      })

      expect(lignes).toBe(1)
    })
  })
}
