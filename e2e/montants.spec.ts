import type { Locator, Page } from "@playwright/test"

import { formatPrice } from "../lib/money"
import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import {
  NOM_LONG_DE_PRODUIT_DE_FIXTURE,
  NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION,
  PRIX_DE_LA_LIGNE_LONGUE_DE_CONFIRMATION,
} from "./harnais/commandes-de-fixture"
import {
  ajouterUnArticleAuPanier,
  cheminDuCheckout,
  VILLE_DE_LA_SONDE,
} from "./harnais/panier"
import { FICHIER_DE_SESSION } from "./harnais/session"
import { expect, test } from "./fixtures/sonde"

async function nombreDeLignesDeTexte(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible()
  return locator.evaluate((element) => {
    const plage = document.createRange()
    plage.selectNodeContents(element)
    return [...plage.getClientRects()].filter(
      (rectangle) => rectangle.width > 0 && rectangle.height > 0
    ).length
  })
}

function valeurDuRecapitulatif(page: Page, libelle: string): Locator {
  return page
    .getByRole("main")
    .locator("dl > div")
    .filter({ has: page.getByText(libelle, { exact: true }) })
    .locator("dd")
}

async function ouvrirLePanier(page: Page, origine: string): Promise<void> {
  await ajouterUnArticleAuPanier(page, origine)

  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(
    `${origine}/panier?ville=${encodeURIComponent(VILLE_DE_LA_SONDE)}`,
    { waitUntil: "domcontentloaded" }
  )
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

async function ouvrirEnSession(page: Page, origine: string, chemin: string) {
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${origine}${chemin}`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

test.describe("le Panier", () => {
  test("7. à 390 × 844, le total à payer occupe une seule ligne", async ({
    page,
    serveur,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 })

    await ouvrirLePanier(page, serveur.origine)

    const total = valeurDuRecapitulatif(page, "Total à payer à la livraison")
    expect(await nombreDeLignesDeTexte(total)).toBe(1)
  })
})

test.describe("le Panier à 320 px", () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test("8. à 320 × 568, ce même total occupe encore une seule ligne", async ({
    page,
    serveur,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 320, height: 568 })

    await ouvrirLePanier(page, serveur.origine)

    const total = valeurDuRecapitulatif(page, "Total à payer à la livraison")
    expect(await nombreDeLignesDeTexte(total)).toBe(1)
  })
})

test.describe("les surfaces en Session courante", () => {
  test.use({ storageState: FICHIER_DE_SESSION })

  test("9. le total du Récapitulatif du Checkout occupe une seule ligne", async ({
    page,
    serveur,
  }) => {
    await ajouterUnArticleAuPanier(page, serveur.origine)
    await ouvrirEnSession(page, serveur.origine, cheminDuCheckout())

    await expect(page).toHaveURL(/\/checkout\?ville=casablanca$/)

    const total = valeurDuRecapitulatif(page, "Total à payer à la livraison")
    expect(await nombreDeLignesDeTexte(total)).toBe(1)
  })

  test("10. le prix de la ligne longue et le total de la confirmation occupent une seule ligne chacun", async ({
    page,
    serveur,
  }) => {
    await ouvrirEnSession(
      page,
      serveur.origine,
      `/commande/confirmation/${NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION}`
    )

    const principal = page.getByRole("main")
    await expect(
      principal.getByRole("heading", { name: "Merci pour votre commande" })
    ).toBeVisible()

    const ligneLongue = principal
      .getByRole("listitem")
      .filter({ hasText: NOM_LONG_DE_PRODUIT_DE_FIXTURE })
    await expect(ligneLongue).toHaveCount(1)

    const prixDeLaLigne = ligneLongue.getByText(
      formatPrice(PRIX_DE_LA_LIGNE_LONGUE_DE_CONFIRMATION)
    )
    expect(await nombreDeLignesDeTexte(prixDeLaLigne)).toBe(1)

    const total = valeurDuRecapitulatif(page, "Total à payer à la livraison")
    expect(await nombreDeLignesDeTexte(total)).toBe(1)
  })

  test("garde — « Livraison offerte » reste un mot", async ({
    page,
    serveur,
  }) => {
    await ouvrirEnSession(
      page,
      serveur.origine,
      `/commande/confirmation/${NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION}`
    )

    const offerte = page
      .getByRole("main")
      .getByText("Livraison offerte", { exact: true })
    await expect(offerte).toBeVisible()

    expect(await nombreDeLignesDeTexte(offerte)).toBe(1)
  })
})
