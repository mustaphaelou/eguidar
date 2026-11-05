import type { Page, Response } from "@playwright/test"

/**
 * L'attente de la sonde : des signaux réels, jamais une pause fixe.
 *
 * Next ne pose `window.__NEXT_HYDRATED` qu'en mode test ; en production, le
 * fait observable est celui de l'application : la coquille de la boutique
 * monte `PanierBadge`, qui lit `GET /api/panier` après hydratation. Armer
 * `attendreLeCompteurDuPanier` **avant** `page.goto`, puis attendre cette
 * réponse, prouve que React a repris la page. Pour une surface sans coquille
 * (administration, confirmation), on retombe sur `load` + `document.fonts.ready`
 * + deux images d'animation — pas `networkidle` seul, qu'une interrogation
 * périodique retarderait.
 */
export function attendreLeCompteurDuPanier(page: Page): Promise<Response> {
  return page.waitForResponse(
    (reponse) => new URL(reponse.url()).pathname === "/api/panier",
    { timeout: 45_000 }
  )
}

export async function attendreLaPagePrete(
  page: Page,
  attenteDuMontage?: Promise<unknown>
): Promise<void> {
  await page.waitForLoadState("domcontentloaded")
  await page.waitForLoadState("load")
  if (attenteDuMontage) await attenteDuMontage
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resoudre) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resoudre()))
    })
  })
}
