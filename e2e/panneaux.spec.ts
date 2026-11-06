import type { Locator, Page } from "@playwright/test"

import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import type { ServeurDeSonde } from "./harnais/serveur"
import { expect, test } from "./fixtures/sonde"

/**
 * Les Panneaux de l'accueil sur le navigateur réel.
 *
 * La fixture attache une Image produit au premier Produit en Mise en avant
 * (`iphone-15-pro`) avant le build. Le fait observé est la boîte que le Client
 * voit : celle de l'Image produit du premier Panneau, et celle du second
 * Panneau, qui n'a pas d'art. Aucune classe, aucun nom de composant.
 */

const PRODUIT_EN_MISE_EN_AVANT = "iPhone 15 Pro"
const PRODUIT_SANS_ART = "Samsung Galaxy S24 Ultra"

async function ouvrirLAccueil(
  page: Page,
  serveur: ServeurDeSonde
): Promise<void> {
  // La coquille cliente lit le Panier après hydratation : armer la réponse
  // avant la navigation, comme `accueil.spec.ts`.
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${serveur.origine}/`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

/** La boîte de l'Image produit du premier Panneau, une fois chargée. */
async function boiteDeLImageDuPremierPanneau(
  page: Page
): Promise<{ hauteur: number; largeur: number }> {
  const image = page.getByRole("img", {
    name: PRODUIT_EN_MISE_EN_AVANT,
    exact: true,
  })
  await expect(image).toHaveCount(1)

  // L'image passe par l'optimiseur de Next : attendre le chargement réel,
  // jamais une pause fixe.
  await expect
    .poll(
      () =>
        image.evaluate(
          (element) =>
            (element as HTMLImageElement).complete &&
            (element as HTMLImageElement).naturalWidth > 0
        ),
      {
        timeout: 30_000,
        message: "l'Image produit du premier Panneau n'est jamais chargée",
      }
    )
    .toBe(true)

  const boite = await image.evaluate((element) => {
    const rectangle = element.getBoundingClientRect()
    return { hauteur: rectangle.height, largeur: rectangle.width }
  })
  return boite
}

/** Le Panneau qui contient un titre de Produit, repéré par son attribut d'apparition déjà en place. */
function panneauDuProduit(page: Page, titre: string): Locator {
  return page
    .locator("[data-reveal-etat]")
    .filter({ has: page.getByRole("heading", { name: titre, exact: true }) })
}

test.describe("le Panneau en Mise en avant", () => {
  test("montre l'art de son Produit à 390 × 844", async ({ page, serveur }) => {
    await ouvrirLAccueil(page, serveur)

    const boite = await boiteDeLImageDuPremierPanneau(page)
    expect(boite.hauteur).toBeGreaterThan(0)
    expect(boite.largeur).toBeGreaterThan(0)
  })

  test("garde la hauteur et la copie d'un Panneau sans art", async ({
    page,
    serveur,
  }) => {
    await ouvrirLAccueil(page, serveur)

    const panneau = panneauDuProduit(page, PRODUIT_SANS_ART)
    await expect(panneau).toBeVisible()
    const boite = await panneau.boundingBox()
    expect(boite).not.toBeNull()
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(500)

    await expect(
      panneau.getByRole("heading", { name: PRODUIT_SANS_ART, exact: true })
    ).toBeVisible()
    await expect(
      panneau.getByRole("button", { name: `Acheter, ${PRODUIT_SANS_ART}` })
    ).toBeVisible()
  })

  test.describe("sur ordinateur", () => {
    test.use({
      viewport: { width: 1280, height: 800 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    })

    test("montre l'art de son Produit à 1280 × 800", async ({
      page,
      serveur,
    }) => {
      await ouvrirLAccueil(page, serveur)
      expect(page.viewportSize()).toEqual({ width: 1280, height: 800 })

      const boite = await boiteDeLImageDuPremierPanneau(page)
      expect(boite.hauteur).toBeGreaterThan(0)
      expect(boite.largeur).toBeGreaterThan(0)
    })
  })
})
