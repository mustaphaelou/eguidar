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

/**
 * Un montant ne se coupe pas : le libellé cède avant le prix (matrice de la
 * spec #923, lignes 7 à 10, et sa garde « Livraison offerte »).
 *
 * L'assertion externe est celle du Client : le texte du montant occupe une
 * seule ligne. On la lit dans la géométrie réelle de la page — les rectangles
 * non vides de la plage de texte —, jamais dans une classe CSS ni un état
 * interne. Le libellé n'est pas contraint : c'est lui qui doit pouvoir se
 * replier, et les cas le laissent faire.
 */

/**
 * Le nombre de lignes qu'occupe le texte d'un élément : la plage de son
 * contenu rend un rectangle par ligne de texte, vides exclus. Un montant qui
 * se coupe au milieu de « MAD » en rend deux.
 */
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

/**
 * La valeur (`dd`) d'une ligne du Récapitulatif de paiement, retrouvée par son
 * libellé (`dt`). La structure `dl > div > (dt, dd)` est celle du composant
 * avant ce ticket : le locator la trouve aussi sur le code d'avant le
 * correctif, et ne dépend d'aucun attribut ajouté.
 */
function valeurDuRecapitulatif(page: Page, libelle: string): Locator {
  return page
    .getByRole("main")
    .locator("dl > div")
    .filter({ has: page.getByText(libelle, { exact: true }) })
    .locator("dd")
}

/** Ajoute un Article par le parcours de la fiche, puis ouvre le Panier. */
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

/** Ouvre une surface qui exige la Session courante, déjà enregistrée. */
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
    // Le Checkout exige un Panier non vide : l'Article est ajouté par le vrai
    // parcours de la fiche, dans le contexte déjà authentifié.
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

    // La ligne de Commande au nom long : seul son prix doit tenir sur une
    // ligne, le nom du Produit reste libre de se replier.
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
    // La Commande de confirmation a des frais de livraison nuls : la ligne de
    // Frais de livraison affiche « Livraison offerte ». Ce cas passe déjà
    // avant le correctif et doit continuer de passer : la valeur reste entière.
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
