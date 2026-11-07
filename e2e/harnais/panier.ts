import { expect, type Page } from "@playwright/test"

import { attendreLaPagePrete, attendreLeCompteurDuPanier } from "./attente"

/**
 * Les gestes du Panier que les cas authentifiés partagent : ouvrir une fiche
 * du Catalogue de démonstration et y ajouter un Article. L'Ajout passe par le
 * vrai parcours de la fiche (le bouton, l'action serveur, la relecture du
 * Panier), pas par un cookie écrit à la main : la sonde traverse la couture
 * du Panier.
 *
 * Le Produit et la Ville sont ceux des Données de démonstration, semées avant
 * le build ; les identifiants de Commande, eux, vivent dans
 * `./commandes-de-fixture`.
 */

export const FICHE_DE_LA_SONDE = "/produit/iphone-15-pro"

/** La Ville de livraison semée par `prisma/seed.ts` (slug « casablanca »). */
export const VILLE_DE_LA_SONDE = "casablanca"

/**
 * Le Checkout en Session courante. Le Récapitulatif n'affiche son total
 * qu'une fois une Ville choisie ; `?ville=<slug>` est la grammaire d'URL que
 * la Page du Panier produit déjà (`villeVersParam`), pas un raccourci de test.
 */
export function cheminDuCheckout(ville: string = VILLE_DE_LA_SONDE): string {
  return `/checkout?ville=${encodeURIComponent(ville)}`
}

/**
 * Ajoute un Article au Panier depuis sa fiche. À appeler dans un contexte
 * authentifié (ou visiteur) déjà monté : la sonde attend la relecture de
 * `GET /api/panier` déclenchée par l'Ajout, pas une pause fixe.
 */
export async function ajouterUnArticleAuPanier(
  page: Page,
  origine: string,
  fiche: string = FICHE_DE_LA_SONDE
): Promise<void> {
  const montage = attendreLeCompteurDuPanier(page)
  const reponse = await page.goto(`${origine}${fiche}`, {
    waitUntil: "domcontentloaded",
  })
  if (reponse?.status() !== 200) {
    throw new Error(
      `[sonde] la fiche ${fiche} n'a pas répondu 200 (${reponse?.status() ?? "aucune réponse"})`
    )
  }
  await attendreLaPagePrete(page, montage)

  // La relecture du Panier suit l'action serveur : l'attendre arme le signal
  // que le Panier a réellement changé.
  const relecture = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === "/api/panier" &&
      candidate.request().method() === "GET",
    { timeout: 30_000 }
  )
  await page
    .getByRole("button", { name: "Ajouter au panier", exact: true })
    .click()
  await relecture
  await expect(page.getByText("Ajouté au panier").first()).toBeVisible()
}
