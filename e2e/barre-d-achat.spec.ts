import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures/sonde"
import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"

/**
 * La Barre d'achat de la fiche Produit : elle attend le défilement, tient sur
 * une ligne et cède au Pied de page (matrice de la spec #923, lignes 12 à 16).
 *
 * La sonde ne regarde que ce qu'un Client observe : l'état `aria-hidden` de la
 * barre, des rectangles qui ne se croisent pas, des boîtes de texte sur une
 * ligne, le nom accessible du bouton. Aucun attribut introduit par le
 * correctif n'est requis : la barre garde son `data-slot` d'avant le ticket.
 */

const CHEMIN_DE_LA_FICHE = "/produit/iphone-15-pro"

const LARGEURS_DE_TELEPHONE = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const

/** Le défilement qui met l'action d'achat hors vue sans atteindre le Pied de page. */
const DEFILEMENT_APRES_L_ACTION = 1000

function barreDAchat(page: Page): Locator {
  return page.locator("[data-slot='barre-d-achat']")
}

function prixDeLaBarre(page: Page): Locator {
  return barreDAchat(page).locator("p").filter({ hasText: "MAD" }).first()
}

function boutonDeLaBarre(page: Page): Locator {
  return barreDAchat(page).getByRole("button")
}

/**
 * L'action d'achat de la page, distincte de celle de la barre : la barre nomme
 * sa Variante, la page non.
 */
function actionDAchatDeLaPage(page: Page): Locator {
  return page.getByRole("button", { name: "Ajouter au panier", exact: true })
}

async function ouvrirLaFiche(page: Page, origine: string): Promise<void> {
  // La coquille cliente lit le Panier après hydratation : cette réponse, armée
  // avant la navigation, est le signal que React a repris la page.
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${origine}${CHEMIN_DE_LA_FICHE}`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

async function defilerAuDelaDeLActionDAchat(page: Page): Promise<void> {
  await page.mouse.wheel(0, DEFILEMENT_APRES_L_ACTION)
  // Les deux conditions hors défilement sont réunies : l'action d'achat a
  // quitté la fenêtre et le Pied de page n'y est pas encore entré.
  await expect(actionDAchatDeLaPage(page)).not.toBeInViewport()
  await expect(page.locator("footer")).not.toBeInViewport()
}

test.describe("la Barre d'achat de la fiche Produit", () => {
  test("12. au chargement, la Barre d'achat est absente", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaFiche(page, serveur.origine)

    // Le bouton d'achat de la page est encore sous la fenêtre : c'est bien le
    // défilement, et non la seule action hors vue, qui manque à la barre.
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
    // Le nom accessible porte la Variante même quand le libellé raccourcit.
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

      // Le bord droit du prix ne dépasse jamais le bord gauche du bouton, et
      // les deux boîtes ne partagent aucune surface.
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
