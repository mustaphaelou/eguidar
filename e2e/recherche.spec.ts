import type { Page } from "@playwright/test"

import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { expect, test } from "./fixtures/sonde"

function champDeRecherche(page: Page) {
  return page.getByRole("textbox", { name: "Rechercher un produit" })
}

function declencheurDeRecherche(page: Page) {
  return page
    .getByRole("button", { name: "Rechercher", exact: true })
    .and(page.locator("button[aria-expanded]"))
}

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

    await expect(
      page.getByRole("link", { name: /iPhone 15 Pro/ }).first()
    ).toBeVisible()

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
