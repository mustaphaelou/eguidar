import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures/sonde"
import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { rapportDeContraste } from "./harnais/contraste"
import { ajouterUnArticleAuPanier, VILLE_DE_LA_SONDE } from "./harnais/panier"

function declencheurDuPanier(page: Page): Locator {
  return page.locator("header").getByRole("button", { name: /^Panier/ })
}

function rangeeLegale(page: Page): Locator {
  return page.locator('[data-slot="rangée-légale"]')
}

async function ouvrirLaBoutique(
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

test.describe("20. le nom accessible du déclencheur du Panier", () => {
  test("20a. garde — sans Article, le bouton s'annonce « Panier »", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const declencheur = declencheurDuPanier(page)
    await expect(declencheur).toBeVisible()
    await expect(declencheur).toHaveAccessibleName("Panier")
  })

  test("20b. après un ajout, il annonce « Panier » et le nombre d'Articles", async ({
    page,
    serveur,
  }) => {
    await ajouterUnArticleAuPanier(page, serveur.origine)

    const declencheur = declencheurDuPanier(page)
    await expect(declencheur).toBeVisible()
    await expect(declencheur).toHaveAccessibleName(/Panier.*1/)
  })
})

test.describe("21. les cibles des liens légaux du Pied de page", () => {
  test("21. chaque lien de la rangée légale offre au moins 24 × 24 px", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const liens = rangeeLegale(page).getByRole("link")
    await expect(liens).toHaveCount(3)

    const libelles = [
      "licence MIT",
      "Conditions & livraison",
      "Suppression des données",
    ]
    for (const libelle of libelles) {
      const lien = rangeeLegale(page).getByRole("link", {
        name: libelle,
        exact: true,
      })
      await expect(lien).toHaveCount(1)
      const boite = await lien.boundingBox()
      expect(boite, `le lien « ${libelle} » n'a pas de boîte`).not.toBeNull()
      expect(
        boite!.width,
        `la cible de « ${libelle} » est trop étroite (${boite!.width} px)`
      ).toBeGreaterThanOrEqual(24)
      expect(
        boite!.height,
        `la cible de « ${libelle} » est trop basse (${boite!.height} px)`
      ).toBeGreaterThanOrEqual(24)
    }
  })
})

test.describe("22. le contraste du vert du Récapitulatif", () => {
  test("22. « Livraison offerte » atteint 4,5:1 sur son fond blanc", async ({
    page,
    serveur,
  }) => {
    await ajouterUnArticleAuPanier(page, serveur.origine)
    await ouvrirLaBoutique(
      page,
      serveur.origine,
      `/panier?ville=${encodeURIComponent(VILLE_DE_LA_SONDE)}`
    )

    const offerte = page
      .getByRole("main")
      .getByText("Livraison offerte", { exact: true })
    await expect(offerte).toBeVisible()

    const ratio = await rapportDeContraste(offerte)
    expect(
      ratio,
      `le vert de « Livraison offerte » ne donne que ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5)
  })
})

test.describe("23. les liens du Catalogue dans le Pied de page", () => {
  test("23. / ouvre le Catalogue depuis le Pied de page", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const pied = page.getByRole("contentinfo")
    await expect(
      pied.getByRole("link", { name: "Tous les produits", exact: true })
    ).toHaveAttribute("href", "/produits")

    for (const [nom, slug] of [
      ["Smartphones", "smartphones"],
      ["Ordinateurs & Tablettes", "ordinateurs-tablettes"],
      ["Audio & Hi-Fi", "audio-hifi"],
      ["TV & Home Cinema", "tv-home-cinema"],
      ["Gaming", "gaming"],
      ["Accessoires", "accessoires"],
    ] as const) {
      await expect(
        pied.getByRole("link", { name: nom, exact: true })
      ).toHaveAttribute("href", `/categorie/${slug}`)
    }
    await expect(pied.locator('a[href^="/categorie/"]')).toHaveCount(6)
  })
})

test.describe("24. les filets de la bande d'assurance du Pied de page", () => {
  test("24. un seul filet sépare la bande de la rangée légale", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const bande = page.locator('[data-slot="bande-assurance"]')
    await expect(bande).toBeVisible()

    const filetAuDessusDeLaBande = await bande.evaluate(
      (element) => getComputedStyle(element).borderTopWidth
    )
    const filetDeLaRangeeLegale = await rangeeLegale(page).evaluate(
      (element) => getComputedStyle(element).borderTopWidth
    )

    expect(filetAuDessusDeLaBande).toBe("0px")
    expect(parseFloat(filetDeLaRangeeLegale)).toBeGreaterThan(0)
  })
})

test.describe("25. l'encre de l'annuaire du Pied de page", () => {
  test("25. l'encre des liens d'annuaire atteint 9:1 sur la surface du Pied", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const lien = page
      .locator('[data-slot="section-pied-de-page"]')
      .first()
      .getByRole("link", { name: "Tous les produits", exact: true })
    await expect(lien).toBeVisible()

    const ratio = await rapportDeContraste(lien)
    expect(
      ratio,
      `l'encre d'annuaire ne donne que ${ratio.toFixed(2)}:1 sur le Pied`
    ).toBeGreaterThanOrEqual(9)
  })
})

const PRODUIT_EN_MISE_EN_AVANT = "iPhone 15 Pro"

test.describe("26. la sémantique du document d'accueil", () => {
  test("26. / porte un seul h1, et c'est le titre du premier Panneau", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const titres = page.getByRole("heading", { level: 1 })
    await expect(titres).toHaveCount(1)
    await expect(titres).toHaveText(PRODUIT_EN_MISE_EN_AVANT)
  })

  test("27. le Pied de page ne porte plus de titre « Pied de page »", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const pied = page.getByRole("contentinfo")
    await expect(pied).toHaveCount(1)
    await expect(pied).toBeVisible()
    await expect(pied).not.toContainText("Pied de page")
    await expect(
      pied.getByRole("heading", { name: "Pied de page" })
    ).toHaveCount(0)
    await expect(
      pied.getByRole("link", { name: "Tous les produits", exact: true })
    ).toBeVisible()
  })
})
