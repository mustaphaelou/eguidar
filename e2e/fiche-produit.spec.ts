import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures/sonde"
import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { rapportDeContraste } from "./harnais/contraste"
import {
  DESCRIPTION_DE_LA_FICHE_DE_PRODUCTION,
  NOM_DE_LA_FICHE_DE_PRODUCTION,
  SLUG_DE_LA_FICHE_DE_PRODUCTION,
} from "./harnais/fiche-de-production"

const PRIX_AFFICHE = "36.887,90"
const PRIX_DE_BASE_AFFICHE = "17.999,90"
const CHEMIN_DE_LA_FICHE = `/produit/${SLUG_DE_LA_FICHE_DE_PRODUCTION}`
const [PREMIERE_LIGNE_DE_LA_DESCRIPTION, SECONDE_LIGNE_DE_LA_DESCRIPTION] =
  DESCRIPTION_DE_LA_FICHE_DE_PRODUCTION.split("\n")

function panneauDeLaFiche(page: Page): Locator {
  return page.locator("[data-reveal-etat]").filter({
    has: page.getByRole("heading", { name: NOM_DE_LA_FICHE_DE_PRODUCTION }),
  })
}

function carteDeLaFiche(page: Page): Locator {
  return page.getByRole("link").filter({
    has: page.getByText(NOM_DE_LA_FICHE_DE_PRODUCTION, { exact: true }),
  })
}

function barreDAchat(page: Page): Locator {
  return page.locator("[data-slot='barre-d-achat']").filter({ visible: true })
}

async function defilerEntreLActionEtLePied(page: Page): Promise<void> {
  const action = page.getByRole("button", {
    name: "Variante indisponible",
    exact: true,
  })
  const boiteDeLAction = await action.boundingBox()
  const boiteDuPied = await page.locator("footer").boundingBox()
  const hauteurDeLaFenetre = page.viewportSize()?.height ?? 0
  if (
    boiteDeLAction === null ||
    boiteDuPied === null ||
    hauteurDeLaFenetre === 0
  ) {
    throw new Error(
      "la fiche ne donne pas la position de l'action et du Pied de page"
    )
  }

  const defilementActuel = await page.evaluate(() => window.scrollY)
  const basDeLAction =
    boiteDeLAction.y + boiteDeLAction.height + defilementActuel
  const hautDuPied = boiteDuPied.y + defilementActuel
  const cible = Math.min(
    basDeLAction + 40,
    hautDuPied - hauteurDeLaFenetre - 40
  )
  await page.evaluate((position) => window.scrollTo(0, position), cible)
}

async function ouvrir(
  page: Page,
  origine: string,
  chemin: string
): Promise<void> {
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${origine}${chemin}`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

test.describe("la fiche du Produit de production", () => {
  test("rend la Description écrite et les Caractéristiques de base", async ({
    page,
    serveur,
  }) => {
    await ouvrir(page, serveur.origine, CHEMIN_DE_LA_FICHE)

    await expect(
      page.getByRole("heading", { name: "Description", exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Caractéristiques", exact: true })
    ).toBeVisible()
    const descriptionAffichee = page
      .getByText(PREMIERE_LIGNE_DE_LA_DESCRIPTION)
      .filter({ visible: true })
    const suiteDeLaDescriptionAffichee = page
      .getByText(SECONDE_LIGNE_DE_LA_DESCRIPTION)
      .filter({ visible: true })
    await expect(descriptionAffichee).toBeVisible()
    await expect(suiteDeLaDescriptionAffichee).toBeVisible()
    await expect(
      page.getByText(/est un produit de notre rayon Smartphones/)
    ).toHaveCount(0)

    const caracteristiquesAffichees = page
      .locator("dl")
      .filter({ visible: true })
    await expect(caracteristiquesAffichees).toContainText("Marque")
    await expect(caracteristiquesAffichees).toContainText("Eguidar")
    await expect(caracteristiquesAffichees).toContainText("Déclinaisons")
    await expect(caracteristiquesAffichees).toContainText("256 Go · 512 Go")
    await expect(caracteristiquesAffichees).toContainText("Livraison")
    await expect(caracteristiquesAffichees).toContainText("Offerte")
  })

  test("montre une vignette par image et change l'image principale", async ({
    page,
    serveur,
  }) => {
    await ouvrir(page, serveur.origine, CHEMIN_DE_LA_FICHE)

    const principale = page.getByRole("img", {
      name: NOM_DE_LA_FICHE_DE_PRODUCTION,
      exact: true,
    })
    await expect(principale).toBeVisible()
    const sourceInitiale = await principale.getAttribute("src")
    expect(sourceInitiale).toBeTruthy()

    const vignettes = page.getByRole("button", {
      name: /Afficher l'image \d sur 2/,
    })
    await expect(vignettes).toHaveCount(2)

    await vignettes.nth(1).click()
    await expect
      .poll(() => principale.getAttribute("src"), {
        timeout: 10_000,
        message: "l'image principale ne suit pas la vignette choisie",
      })
      .not.toBe(sourceInitiale)
    await expect(page.getByText("2 / 2", { exact: true })).toBeVisible()
  })

  test("désactive l'action d'achat quand la Variante choisie est épuisée", async ({
    page,
    serveur,
  }) => {
    await ouvrir(page, serveur.origine, CHEMIN_DE_LA_FICHE)

    const actionDisponible = page.getByRole("button", {
      name: "Ajouter au panier",
      exact: true,
    })
    await expect(actionDisponible).toBeEnabled()

    await page
      .getByRole("button", { name: "256 Go — rupture de stock", exact: true })
      .click()

    await expect(
      page.getByRole("button", { name: "Variante indisponible", exact: true })
    ).toBeDisabled()

    await defilerEntreLActionEtLePied(page)
    await expect(
      page.getByRole("button", { name: "Variante indisponible", exact: true })
    ).not.toBeInViewport()
    await expect(page.locator("footer")).not.toBeInViewport()
    await expect(barreDAchat(page)).toHaveAttribute("aria-hidden", "false")
    await expect(
      barreDAchat(page).getByText("Indisponible", { exact: true })
    ).toBeVisible()
    await expect(barreDAchat(page).getByRole("button")).toHaveAccessibleName(
      "Produit indisponible — 256 Go"
    )
  })

  test("annonce le prix des Variantes sur l'accueil, le catalogue et la fiche", async ({
    page,
    serveur,
  }) => {
    await ouvrir(page, serveur.origine, "/")
    const panneau = panneauDeLaFiche(page)
    await expect(panneau).toBeVisible()
    await expect(panneau).toContainText(PRIX_AFFICHE)
    await expect(panneau).not.toContainText(PRIX_DE_BASE_AFFICHE)

    await ouvrir(page, serveur.origine, "/categorie/smartphones")
    const carte = carteDeLaFiche(page)
    await expect(carte).toBeVisible()
    await expect(carte).toContainText(PRIX_AFFICHE)
    await expect(carte).not.toContainText(PRIX_DE_BASE_AFFICHE)

    await ouvrir(page, serveur.origine, CHEMIN_DE_LA_FICHE)
    await expect(page.getByRole("main")).toContainText(PRIX_AFFICHE)
    await expect(page.getByRole("main")).not.toContainText(PRIX_DE_BASE_AFFICHE)
  })

  test("navigue dans la galerie par les boutons suivant/précédent et le clavier", async ({
    page,
    serveur,
  }) => {
    await ouvrir(page, serveur.origine, CHEMIN_DE_LA_FICHE)

    const principale = page.getByRole("img", {
      name: NOM_DE_LA_FICHE_DE_PRODUCTION,
      exact: true,
    })
    const sourceInitiale = await principale.getAttribute("src")

    await page
      .getByRole("button", { name: "Image suivante", exact: true })
      .click()
    await expect(page.getByText("2 / 2", { exact: true })).toBeVisible()
    await expect
      .poll(() => principale.getAttribute("src"))
      .not.toBe(sourceInitiale)

    await page
      .getByRole("button", { name: "Image précédente", exact: true })
      .click()
    await expect(page.getByText("1 / 2", { exact: true })).toBeVisible()

    const premiereVignette = page
      .getByRole("button", { name: /Afficher l'image 1 sur 2/ })
      .first()
    await premiereVignette.focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByText("2 / 2", { exact: true })).toBeVisible()

    await page.keyboard.press("ArrowLeft")
    await expect(page.getByText("1 / 2", { exact: true })).toBeVisible()
  })

  test("offre des cibles tactiles >= 44 px et un accusé d'ajout contrasté", async ({
    page,
    serveur,
  }) => {
    await ouvrir(page, serveur.origine, CHEMIN_DE_LA_FICHE)

    const puces = page
      .getByRole("group", { name: "Variante" })
      .getByRole("button")
    const nombrePuces = await puces.count()
    expect(nombrePuces).toBeGreaterThanOrEqual(2)
    for (let i = 0; i < nombrePuces; i++) {
      const boite = await puces.nth(i).boundingBox()
      expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44)
    }

    const action = page.getByRole("button", {
      name: "Ajouter au panier",
      exact: true,
    })
    const boiteAction = await action.boundingBox()
    expect(boiteAction?.height ?? 0).toBeGreaterThanOrEqual(44)

    await action.click()
    const statut = page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "Ajouté au panier" })
      .first()
    await expect(statut).toBeVisible()
    expect(await rapportDeContraste(statut)).toBeGreaterThanOrEqual(4.5)
  })

  test.describe("à 320 × 568", () => {
    test.use({ viewport: { width: 320, height: 568 } })

    test("garde les vignettes >= 44 × 44 px sans débordement horizontal", async ({
      page,
      serveur,
    }) => {
      await ouvrir(page, serveur.origine, CHEMIN_DE_LA_FICHE)

      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(320)

      const vignettes = page.getByRole("button", {
        name: /Afficher l'image \d sur 2/,
      })
      await expect(vignettes).toHaveCount(2)
      for (let i = 0; i < 2; i++) {
        const boite = await vignettes.nth(i).boundingBox()
        expect(boite?.width ?? 0).toBeGreaterThanOrEqual(44)
        expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44)
      }
    })
  })

  test.describe("sur ordinateur à 1280 × 800", () => {
    test.use({
      viewport: { width: 1280, height: 800 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    })

    test("aligne le fil d'Ariane, place galerie et achat côte à côte au-dessus de la ligne de flottaison et détache les cartes liées", async ({
      page,
      serveur,
    }) => {
      await ouvrir(page, serveur.origine, CHEMIN_DE_LA_FICHE)

      const boiteEntete = await page
        .locator("header > div")
        .first()
        .boundingBox()
      const boiteFil = await page
        .locator('nav[aria-label="Fil d\'Ariane"] ol')
        .filter({ visible: true })
        .boundingBox()
      const boiteSection = await page
        .locator("main section")
        .first()
        .boundingBox()

      expect(boiteEntete).not.toBeNull()
      expect(boiteFil).not.toBeNull()
      expect(boiteSection).not.toBeNull()
      expect(Math.abs(boiteFil!.x - boiteEntete!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(boiteFil!.x - boiteSection!.x)).toBeLessThanOrEqual(1)

      const boiteGalerie = await page
        .getByRole("img", { name: NOM_DE_LA_FICHE_DE_PRODUCTION, exact: true })
        .boundingBox()
      const action = page.getByRole("button", {
        name: "Ajouter au panier",
        exact: true,
      })
      const boiteAction = await action.boundingBox()

      expect(boiteGalerie).not.toBeNull()
      expect(boiteAction).not.toBeNull()
      expect(boiteGalerie!.x + boiteGalerie!.width).toBeLessThanOrEqual(
        boiteAction!.x
      )
      await expect(action).toBeInViewport()

      const sectionLies = page.locator("main section").filter({
        has: page.getByRole("heading", { name: "Vous aimerez aussi" }),
      })
      await sectionLies.scrollIntoViewIfNeeded()
      const fondSection = await sectionLies.evaluate(
        (element) => getComputedStyle(element).backgroundColor
      )
      const fondCarte = await sectionLies
        .locator("a div")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(fondCarte).not.toBe(fondSection)
    })
  })
})
