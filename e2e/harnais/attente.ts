import type { Page, Response } from "@playwright/test"

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
