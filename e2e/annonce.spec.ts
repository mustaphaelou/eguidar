import type { Page } from "@playwright/test"

import { attendreLaPagePrete } from "./harnais/attente"
import { FICHIER_DE_SESSION } from "./harnais/session"
import { expect, test } from "./fixtures/sonde"

test.use({ storageState: FICHIER_DE_SESSION })

const MESSAGE_TEST = "Livraison offerte dès 500 MAD"
const LIEN_URL_TEST = "/produits"
const LIEN_LIBELLE_TEST = "Découvrir"

async function ouvrirAdminAnnonce(page: Page, origine: string): Promise<void> {
  const reponse = await page.goto(`${origine}/admin/annonce`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page)
}

async function verifierRubanSousLeBandeau(page: Page): Promise<void> {
  const bandeau = page.getByRole("banner")
  const ruban = page.getByRole("region", { name: "Annonce" })
  const principal = page.getByRole("main")

  await expect(bandeau).toBeVisible()
  await expect(ruban).toBeVisible()
  await expect(ruban).toContainText(MESSAGE_TEST)
  await expect(
    ruban.getByRole("link", { name: LIEN_LIBELLE_TEST })
  ).toHaveAttribute("href", LIEN_URL_TEST)

  const boiteBandeau = await bandeau.boundingBox()
  const boiteRuban = await ruban.boundingBox()
  const boitePrincipal = await principal.boundingBox()

  expect(boiteBandeau).not.toBeNull()
  expect(boiteRuban).not.toBeNull()
  expect(boitePrincipal).not.toBeNull()

  const basDuBandeau = boiteBandeau!.y + boiteBandeau!.height
  expect(Math.abs(boiteRuban!.y - basDuBandeau)).toBeLessThanOrEqual(2)
  expect(boiteRuban!.y + boiteRuban!.height).toBeLessThanOrEqual(
    boitePrincipal!.y + 2
  )
}

test.describe("Annonce — cycle complet Administration et boutique", () => {
  test("refuse une saisie invalide, publie sur la boutique avec lien interne puis masque", async ({
    page,
    serveur,
  }) => {
    await ouvrirAdminAnnonce(page, serveur.origine)

    const interrupteur = page.getByRole("switch", {
      name: "Afficher sur la boutique",
    })
    const champMessage = page.getByLabel("Message")
    const champLienUrl = page.getByLabel("Lien interne (optionnel)")
    const champLienLibelle = page.getByLabel("Libellé du lien (optionnel)")
    const boutonEnregistrer = page.getByRole("button", {
      name: "Enregistrer l'Annonce",
    })
    const apercu = page.getByRole("region", { name: "Aperçu sur la boutique" })

    if ((await interrupteur.getAttribute("aria-checked")) !== "true") {
      await interrupteur.click()
    }
    await champMessage.fill("")
    await champLienUrl.fill("")
    await champLienLibelle.fill("")
    await boutonEnregistrer.click()

    const formulaire = page.locator("form")
    const alerte = formulaire.getByRole("alert")
    await expect(alerte).toBeVisible()
    await expect(alerte).toContainText(
      "le message est requis lorsque l'Annonce est active"
    )

    await champMessage.fill(MESSAGE_TEST)
    await champLienUrl.fill(LIEN_URL_TEST)
    await champLienLibelle.fill(LIEN_LIBELLE_TEST)

    await expect(apercu).toContainText(MESSAGE_TEST)
    await expect(apercu).toContainText(LIEN_LIBELLE_TEST)

    await boutonEnregistrer.click()
    await expect(formulaire.getByRole("status")).toContainText(
      "Annonce enregistrée."
    )

    const reponseAccueil = await page.goto(`${serveur.origine}/`, {
      waitUntil: "domcontentloaded",
    })
    expect(reponseAccueil?.status()).toBe(200)
    await attendreLaPagePrete(page)
    await verifierRubanSousLeBandeau(page)

    const lienRuban = page
      .getByRole("region", { name: "Annonce" })
      .getByRole("link", { name: LIEN_LIBELLE_TEST })
    await Promise.all([
      page.waitForURL(`${serveur.origine}${LIEN_URL_TEST}`),
      lienRuban.click(),
    ])
    await attendreLaPagePrete(page)
    await verifierRubanSousLeBandeau(page)

    await ouvrirAdminAnnonce(page, serveur.origine)
    const interrupteurDesactivation = page.getByRole("switch", {
      name: "Afficher sur la boutique",
    })
    await expect(interrupteurDesactivation).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await interrupteurDesactivation.click()
    await expect(interrupteurDesactivation).toHaveAttribute(
      "aria-checked",
      "false"
    )
    await expect(
      page.getByRole("region", { name: "Aperçu sur la boutique" })
    ).toContainText("Masquée sur la boutique")

    await page.getByRole("button", { name: "Enregistrer l'Annonce" }).click()
    await expect(page.locator("form").getByRole("status")).toContainText(
      "Annonce enregistrée."
    )

    await page.goto(`${serveur.origine}/`, { waitUntil: "domcontentloaded" })
    await attendreLaPagePrete(page)
    await expect(page.getByRole("region", { name: "Annonce" })).toHaveCount(0)

    await page.goto(`${serveur.origine}${LIEN_URL_TEST}`, {
      waitUntil: "domcontentloaded",
    })
    await attendreLaPagePrete(page)
    await expect(page.getByRole("region", { name: "Annonce" })).toHaveCount(0)
  })
})
