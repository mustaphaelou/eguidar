import type { Locator, Page } from "@playwright/test"

import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { expect, test } from "./fixtures/sonde"

/**
 * Les deux débordements de 320 px, mesurés sur l'artefact construit.
 *
 * La page 404 de la boutique et la pastille de Livraison offerte d'une Carte
 * produit poussent le document au-delà de la fenêtre. Les cas ne regardent que
 * des faits de Client : largeur du document, boîtes entièrement dans la
 * fenêtre, boîte de la pastille incluse dans celle de sa carte, icône visible,
 * texte non rogné.
 */

async function boiteDe(locator: Locator) {
  const boite = await locator.boundingBox()
  if (boite === null) throw new Error("la boîte de l'élément est introuvable")
  return boite
}

async function laCarteOfferte(page: Page) {
  const carte = page
    .getByRole("link")
    .filter({ hasText: "Livraison offerte" })
    .first()
  await expect(carte).toBeVisible()
  return carte
}

async function pastilleOfferte(carte: Locator) {
  const pastille = carte.getByText("Livraison offerte", { exact: true })
  await expect(pastille).toBeVisible()
  return pastille
}

async function attendreLeCatalogue(page: Page, origine: string) {
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${origine}/produits`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

function exigerDansLaCarte(
  pastille: { x: number; y: number; width: number; height: number },
  carte: { x: number; y: number; width: number; height: number }
) {
  expect(pastille.x).toBeGreaterThanOrEqual(carte.x)
  expect(pastille.y).toBeGreaterThanOrEqual(carte.y)
  expect(pastille.x + pastille.width).toBeLessThanOrEqual(carte.x + carte.width)
  expect(pastille.y + pastille.height).toBeLessThanOrEqual(
    carte.y + carte.height
  )
}

test.describe("à 320 px", () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test("la 404 de la boutique tient dans la largeur, sans bouton rogné", async ({
    page,
    serveur,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 320, height: 568 })

    const montageDuPanier = attendreLeCompteurDuPanier(page)
    await page.goto(`${serveur.origine}/produit/ce-produit-nexiste-pas`, {
      waitUntil: "domcontentloaded",
    })
    await attendreLaPagePrete(page, montageDuPanier)

    // La 404 de la boutique rend ses deux actions, pas celle de la 404 racine.
    await expect(
      page.getByRole("heading", { name: "Page introuvable" })
    ).toBeVisible()
    const boutons = [
      page.getByRole("button", { name: "Découvrir les produits" }),
      page.getByRole("button", { name: "Retour à l'accueil" }),
    ]
    for (const bouton of boutons) await expect(bouton).toBeVisible()

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBe(320)

    for (const bouton of boutons) {
      const boite = await boiteDe(bouton)
      expect(boite.x).toBeGreaterThanOrEqual(0)
      expect(boite.y).toBeGreaterThanOrEqual(0)
      expect(boite.x + boite.width).toBeLessThanOrEqual(320)
      expect(boite.y + boite.height).toBeLessThanOrEqual(568)
    }
  })

  test("la pastille de Livraison offerte reste dans les bornes de sa carte", async ({
    page,
    serveur,
  }) => {
    await attendreLeCatalogue(page, serveur.origine)

    const carte = await laCarteOfferte(page)
    const pastille = await pastilleOfferte(carte)

    exigerDansLaCarte(await boiteDe(pastille), await boiteDe(carte))

    // Sous sm, l'icône s'efface et le libellé reste entier.
    await expect(pastille.locator("svg")).toBeHidden()
    expect(
      await pastille.evaluate((element) => element.scrollWidth)
    ).toBeLessThanOrEqual(
      await pastille.evaluate((element) => element.clientWidth)
    )
  })
})

test.describe("au-dessus de sm", () => {
  test.use({ viewport: { width: 640, height: 800 } })

  test("la pastille garde son icône et ses 12 px, et reste dans sa carte", async ({
    page,
    serveur,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 640, height: 800 })

    await attendreLeCatalogue(page, serveur.origine)

    const carte = await laCarteOfferte(page)
    const pastille = await pastilleOfferte(carte)

    await expect(pastille.locator("svg")).toBeVisible()
    // `text-xs` vaut 0,75 rem et la racine mesure 106,25 % : 12,75 px, la
    // taille que le ticket demande de garder au-dessus de sm.
    expect(
      await pastille.evaluate((element) => getComputedStyle(element).fontSize)
    ).toBe("12.75px")

    exigerDansLaCarte(await boiteDe(pastille), await boiteDe(carte))
  })
})
