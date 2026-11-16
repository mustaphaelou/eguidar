import { expect, type Page } from "@playwright/test"

import { attendreLaPagePrete, attendreLeCompteurDuPanier } from "./attente"

export const FICHE_DE_LA_SONDE = "/produit/iphone-15-pro"

export const VILLE_DE_LA_SONDE = "casablanca"

export function cheminDuCheckout(ville: string = VILLE_DE_LA_SONDE): string {
  return `/checkout?ville=${encodeURIComponent(ville)}`
}

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
