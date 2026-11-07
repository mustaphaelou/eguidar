import type { Locator, Page } from "@playwright/test"

import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import type { ServeurDeSonde } from "./harnais/serveur"
import { expect, test } from "./fixtures/sonde"

/**
 * Le nom du Produit dans une Suggestion, mesuré sur l'artefact construit.
 *
 * Le défaut est une colonne de nom qui se résout à zéro parce que le panneau
 * suit la boîte du champ et non la rangée de Recherche. Les cas ne lisent que
 * ce que le Client voit : une boîte de largeur non nulle pour le nom, la
 * marque et le prix lisibles à 320 px, et un panneau qui ne dépasse jamais la
 * fenêtre. Aucun attribut ajouté par le correctif n'est requis.
 */

const PRODUIT = "iPhone 15 Pro"
const MARQUE = "Apple"

async function ouvrirLeCatalogue(
  page: Page,
  serveur: ServeurDeSonde
): Promise<void> {
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${serveur.origine}/produits`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

function champDeRecherche(page: Page) {
  return page.getByRole("textbox", { name: "Rechercher un produit" })
}

/** Le déclencheur du Bandeau, seul bouton « Rechercher » qui déplie la rangée. */
function declencheurDeRecherche(page: Page) {
  return page
    .getByRole("button", { name: "Rechercher", exact: true })
    .and(page.locator("button[aria-expanded]"))
}

/** Ouvre la rangée, tape `iphone` et attend la réponse des Suggestions. */
async function ouvrirLesSuggestions(page: Page): Promise<Locator> {
  await declencheurDeRecherche(page).click()
  await expect(champDeRecherche(page)).toBeVisible()

  const reponseDesSuggestions = page.waitForResponse(
    (reponse) =>
      new URL(reponse.url()).pathname === "/api/recherche/suggestions"
  )
  await champDeRecherche(page).fill("iphone")
  await reponseDesSuggestions

  const suggestion = page
    .locator("header")
    .getByRole("link", { name: new RegExp(PRODUIT) })
    .first()
  await expect(suggestion).toBeVisible()
  return suggestion
}

/** Le nom du Produit, repéré par son texte et non par une classe. */
function nomDeLaSuggestion(suggestion: Locator) {
  return suggestion.getByText(PRODUIT, { exact: true })
}

/**
 * Le panneau, repéré par son action « Voir tous les résultats » : c'est un
 * texte que le Client lit, pas un attribut du correctif. Le bouton est enfant
 * direct du panneau.
 */
function panneauDesSuggestions(page: Page) {
  return page
    .getByRole("button", { name: "Voir tous les résultats" })
    .locator("..")
}

async function largeurDeLaBoite(locator: Locator): Promise<number> {
  const boite = await locator.boundingBox()
  if (boite === null) throw new Error("la boîte de l'élément est introuvable")
  return boite.width
}

/** La largeur du texte d'invite, mesurée avec la police composée du champ. */
async function texteDAttente(page: Page) {
  return champDeRecherche(page).evaluate((input) => {
    const style = getComputedStyle(input)
    const canvas = document.createElement("canvas")
    const contexte = canvas.getContext("2d")
    if (contexte === null) throw new Error("aucun contexte de canevas 2D")
    contexte.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const texte = input.getAttribute("placeholder") ?? ""
    return {
      texte,
      largeurDuTexte: contexte.measureText(texte).width,
      largeurUtile:
        input.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight),
    }
  })
}

test.describe("la Suggestion de produit", () => {
  test("montre le nom du Produit à 390 × 844", async ({ page, serveur }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 })

    await ouvrirLeCatalogue(page, serveur)
    const suggestion = await ouvrirLesSuggestions(page)

    // Une boîte de largeur nulle n'est pas visible pour Playwright : c'est
    // exactement le défaut que la Suggestion corrige.
    const nom = nomDeLaSuggestion(suggestion)
    await expect(nom).toBeVisible()
    expect(await largeurDeLaBoite(nom)).toBeGreaterThan(0)
  })

  test.describe("à 320 px", () => {
    test.use({ viewport: { width: 320, height: 568 } })

    test("garde le nom, la marque et le prix lisibles", async ({
      page,
      serveur,
    }) => {
      expect(page.viewportSize()).toEqual({ width: 320, height: 568 })

      await ouvrirLeCatalogue(page, serveur)
      const suggestion = await ouvrirLesSuggestions(page)

      const nom = nomDeLaSuggestion(suggestion)
      await expect(nom).toBeVisible()
      // La colonne garde la place d'au moins un nom court ; l'ellipse est
      // attendue pour « iPhone 15 Pro », pas la disparition de la colonne.
      expect(await largeurDeLaBoite(nom)).toBeGreaterThanOrEqual(48)

      const marque = suggestion.getByText(MARQUE, { exact: true })
      await expect(marque).toBeVisible()
      expect(await largeurDeLaBoite(marque)).toBeGreaterThan(0)

      // Le prix est le seul texte de la ligne qui porte la devise.
      const prix = suggestion.getByText(/MAD/)
      await expect(prix).toBeVisible()
      expect(await largeurDeLaBoite(prix)).toBeGreaterThan(0)
    })

    test("garde son nom accessible et une invite qui tient dans le champ", async ({
      page,
      serveur,
    }) => {
      await ouvrirLeCatalogue(page, serveur)
      await ouvrirLesSuggestions(page)

      // Le locator par rôle a déjà exigé « Rechercher un produit » ; la mesure
      // prouve que l'invite raccourcie tient dans le champ, sans troncature.
      const invite = await texteDAttente(page)
      expect(invite.texte).not.toBe("")
      expect(invite.largeurDuTexte).toBeLessThanOrEqual(invite.largeurUtile)
    })
  })

  test("garde le panneau dans la fenêtre", async ({ page, serveur }) => {
    await ouvrirLeCatalogue(page, serveur)
    await ouvrirLesSuggestions(page)

    const panneau = panneauDesSuggestions(page)
    const boite = await panneau.boundingBox()
    if (boite === null) throw new Error("la boîte du panneau est introuvable")

    expect(boite.x).toBeGreaterThanOrEqual(0)
    expect(boite.x + boite.width).toBeLessThanOrEqual(390)
  })
})
