import type { Locator, Page } from "@playwright/test"

import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import type { ServeurDeSonde } from "./harnais/serveur"
import { expect, test } from "./fixtures/sonde"

const PRODUIT_EN_MISE_EN_AVANT = "iPhone 15 Pro"
const PRODUIT_SANS_ART = "Samsung Galaxy S24 Ultra"
const PRODUIT_EN_DUO = "MacBook Air 13 M3"

async function ouvrirLAccueil(
  page: Page,
  serveur: ServeurDeSonde
): Promise<void> {
  const montageDuPanier = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${serveur.origine}/`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page, montageDuPanier)
}

async function boiteDeLImageDuPremierPanneau(
  page: Page
): Promise<{ hauteur: number; largeur: number }> {
  const image = page.getByRole("img", {
    name: PRODUIT_EN_MISE_EN_AVANT,
    exact: true,
  })
  await expect(image).toHaveCount(1)

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

function panneauDuProduit(page: Page, titre: string): Locator {
  return page
    .locator("[data-reveal-etat]")
    .filter({ has: page.getByRole("heading", { name: titre, exact: true }) })
}

function imageDuPanneau(page: Page, titre: string): Locator {
  return panneauDuProduit(page, titre).getByRole("img", {
    name: titre,
    exact: true,
  })
}

async function stylesDeLImage(image: Locator): Promise<{
  objectFit: string
  objectPosition: string
  mixBlendMode: string
}> {
  return image.evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      objectFit: styles.objectFit,
      objectPosition: styles.objectPosition,
      mixBlendMode: styles.mixBlendMode,
    }
  })
}

test.describe("le Panneau en Mise en avant", () => {
  test("montre l'art de son Produit à 390 × 844", async ({ page, serveur }) => {
    await ouvrirLAccueil(page, serveur)

    const boite = await boiteDeLImageDuPremierPanneau(page)
    expect(boite.hauteur).toBeGreaterThan(0)
    expect(boite.largeur).toBeGreaterThan(0)
  })

  test("recadre l'art du premier Panneau en couverture, ancré en bas, sans fondu", async ({
    page,
    serveur,
  }) => {
    await ouvrirLAccueil(page, serveur)

    const styles = await stylesDeLImage(
      imageDuPanneau(page, PRODUIT_EN_MISE_EN_AVANT)
    )
    expect(styles.objectFit).toBe("cover")
    expect(styles.objectPosition).toMatch(/bottom|100%/)
    expect(styles.mixBlendMode).toBe("normal")
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

  test("garde la composition d'un Panneau en duo", async ({
    page,
    serveur,
  }) => {
    await ouvrirLAccueil(page, serveur)

    const panneau = panneauDuProduit(page, PRODUIT_EN_DUO)
    await expect(panneau).toBeVisible()
    const boite = await panneau.boundingBox()
    expect(boite).not.toBeNull()
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(500)

    await expect(
      panneau.getByRole("heading", { name: PRODUIT_EN_DUO, exact: true })
    ).toBeVisible()
    await expect(
      panneau.getByRole("button", { name: `Acheter, ${PRODUIT_EN_DUO}` })
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

    test("montre le Produit entier, centré et fondu dans le champ", async ({
      page,
      serveur,
    }) => {
      await ouvrirLAccueil(page, serveur)

      const styles = await stylesDeLImage(
        imageDuPanneau(page, PRODUIT_EN_MISE_EN_AVANT)
      )
      expect(styles.objectFit).toBe("contain")
      expect(styles.objectPosition).toMatch(/center|50% 50%/)
      expect(styles.mixBlendMode).toBe("multiply")
    })
  })
})
