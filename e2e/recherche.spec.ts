import type { Page } from "@playwright/test"

import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { expect, test } from "./fixtures/sonde"

/**
 * La Recherche part au clavier comme au bouton.
 *
 * Le parcours est celui du Client : ouvrir la Recherche du Bandeau, taper,
 * puis valider — par Entrée ou par le bouton. La sonde ne lit que ce que le
 * navigateur rend visible : l'adresse après la touche, le lien d'un Produit,
 * la rangée refermée. Aucun attribut ajouté par le correctif n'est requis.
 */

function champDeRecherche(page: Page) {
  return page.getByRole("textbox", { name: "Rechercher un produit" })
}

/** Le déclencheur du Bandeau, seul bouton « Rechercher » qui déplie la rangée. */
function declencheurDeRecherche(page: Page) {
  return page
    .getByRole("button", { name: "Rechercher", exact: true })
    .and(page.locator("button[aria-expanded]"))
}

/** Le bouton de soumission, dans le formulaire que le Client voit. */
function soumettreLaRecherche(page: Page) {
  return page
    .locator("header form[action='/recherche']")
    .getByRole("button", { name: "Rechercher", exact: true })
}

async function ouvrirLaBoutique(page: Page, origine: string, chemin = "/") {
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${origine}${chemin}`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

async function ouvrirLaRecherche(page: Page) {
  await declencheurDeRecherche(page).click()
  await expect(champDeRecherche(page)).toBeVisible()
}

test.describe("la Recherche du Bandeau de navigation", () => {
  test("taper une requête puis Entrée mène à la page de résultats", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine)
    await ouvrirLaRecherche(page)

    await champDeRecherche(page).fill("iphone")
    await champDeRecherche(page).press("Enter")

    await page.waitForURL(
      (url) =>
        url.pathname === "/recherche" && url.searchParams.get("q") === "iphone",
      { timeout: 15_000 }
    )
    expect(page.url()).toBe(`${serveur.origine}/recherche?q=iphone`)

    // Au moins un résultat : le lien d'un Produit est visible.
    await expect(
      page.getByRole("link", { name: /iPhone 15 Pro/ }).first()
    ).toBeVisible()

    // La rangée de Recherche se referme après la navigation.
    await expect(champDeRecherche(page)).toHaveCount(0)
  })

  test("le bouton Rechercher mène à la même adresse que la touche Entrée", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine)
    await ouvrirLaRecherche(page)

    await champDeRecherche(page).fill("iphone")
    await soumettreLaRecherche(page).click()

    await page.waitForURL(
      (url) =>
        url.pathname === "/recherche" && url.searchParams.get("q") === "iphone",
      { timeout: 15_000 }
    )
    expect(page.url()).toBe(`${serveur.origine}/recherche?q=iphone`)

    await expect(
      page.getByRole("link", { name: /iPhone 15 Pro/ }).first()
    ).toBeVisible()
  })

  test("une soumission vide mène à /recherche sans q", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine)
    await ouvrirLaRecherche(page)

    await champDeRecherche(page).press("Enter")

    await page.waitForURL(
      (url) => url.pathname === "/recherche" && !url.searchParams.has("q"),
      { timeout: 15_000 }
    )
    expect(page.url()).toBe(`${serveur.origine}/recherche`)
  })

  test("les Suggestions s'ouvrent à la frappe et ouvrent leur Produit", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/produits")
    await ouvrirLaRecherche(page)

    await champDeRecherche(page).fill("iphone")

    // Le Bandeau ne porte pas de lien Produit avant la frappe : ce lien est la
    // Suggestion, pas une Carte du Catalogue. L'index peut rendre plusieurs
    // documents pour le même Produit : une Suggestion visible suffit.
    const suggestion = page
      .locator("header")
      .getByRole("link", { name: /iPhone 15 Pro/ })
      .first()
    await expect(suggestion).toBeVisible()

    await suggestion.click()
    await page.waitForURL((url) => url.pathname === "/produit/iphone-15-pro", {
      timeout: 15_000,
    })
    expect(page.url()).toBe(`${serveur.origine}/produit/iphone-15-pro`)
  })
})
