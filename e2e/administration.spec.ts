import type { Locator, Page } from "@playwright/test"

import { attendreLaPagePrete } from "./harnais/attente"
import { FICHIER_DE_SESSION } from "./harnais/session"
import { expect, test } from "./fixtures/sonde"

test.use({ storageState: FICHIER_DE_SESSION })

const CA_ENCAISSE = "Chiffre d'affaires encaissé"

async function ouvrirLeTableauDeBord(
  page: Page,
  origine: string
): Promise<void> {
  const reponse = await page.goto(`${origine}/admin`, {
    waitUntil: "domcontentloaded",
  })
  expect(reponse?.status()).toBe(200)
  await attendreLaPagePrete(page)
}

function laCarteDuCA(page: Page): Locator {
  return page
    .getByRole("region", { name: "Indicateurs principaux" })
    .locator("[data-slot='card']")
    .filter({ has: page.getByText(CA_ENCAISSE, { exact: true }) })
}

function laValeurDuCA(page: Page): Locator {
  return laCarteDuCA(page).locator("p").filter({ hasText: "MAD" })
}

interface MesuresDeLaValeur {
  texte: { x: number; y: number; width: number; height: number } | null
  lignes: number
  scrollWidth: number
  clientWidth: number
  fontSize: number
}

async function mesurerLaValeur(valeur: Locator): Promise<MesuresDeLaValeur> {
  return valeur.evaluate((element) => {
    const plage = document.createRange()
    plage.selectNodeContents(element)
    const rectangles = [...plage.getClientRects()].filter(
      (rectangle) => rectangle.width > 0 && rectangle.height > 0
    )
    const texte =
      rectangles.length === 0
        ? null
        : {
            x: Math.min(...rectangles.map((rectangle) => rectangle.left)),
            y: Math.min(...rectangles.map((rectangle) => rectangle.top)),
            width:
              Math.max(...rectangles.map((rectangle) => rectangle.right)) -
              Math.min(...rectangles.map((rectangle) => rectangle.left)),
            height:
              Math.max(...rectangles.map((rectangle) => rectangle.bottom)) -
              Math.min(...rectangles.map((rectangle) => rectangle.top)),
          }

    return {
      texte,
      lignes: rectangles.length,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
    }
  })
}

async function attendreLaMiseEnPage(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resoudre) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resoudre()))
      })
  )
}

test.describe("le tableau de bord de l'Administration sur téléphone", () => {
  test("11. la valeur du CA encaissé tient dans sa carte, sur une ligne", async ({
    page,
    serveur,
  }) => {
    expect(page.viewportSize()).toEqual({ width: 390, height: 844 })
    await ouvrirLeTableauDeBord(page, serveur.origine)

    const carte = laCarteDuCA(page)
    await expect(carte).toBeVisible()

    const valeur = laValeurDuCA(page)
    await expect(valeur).toHaveCount(1)
    await expect(valeur).toBeVisible()

    const montant = (await valeur.innerText()).trim()
    expect(montant).toMatch(/^\d[\d\s.,]*MAD$/u)

    const mesures = await mesurerLaValeur(valeur)
    expect(mesures.texte, "le texte de la valeur n'a aucun rectangle").not.toBe(
      null
    )

    expect(
      mesures.scrollWidth,
      `la valeur déborde de sa boîte (${mesures.scrollWidth} px rendus pour ${mesures.clientWidth} px disponibles) : « ${montant} » est tronqué`
    ).toBeLessThanOrEqual(mesures.clientWidth)

    expect(
      mesures.lignes,
      `la valeur « ${montant} » occupe ${mesures.lignes} lignes au lieu d'une`
    ).toBe(1)

    const boiteDeLaCarte = await carte.boundingBox()
    expect(boiteDeLaCarte).not.toBeNull()
    expect(
      mesures.texte!.x,
      "le texte de la valeur commence à gauche de sa carte"
    ).toBeGreaterThanOrEqual(boiteDeLaCarte!.x)
    expect(
      mesures.texte!.x + mesures.texte!.width,
      `le texte de la valeur dépasse le bord droit de sa carte (${mesures.texte!.x + mesures.texte!.width} px pour un bord à ${boiteDeLaCarte!.x + boiteDeLaCarte!.width} px)`
    ).toBeLessThanOrEqual(boiteDeLaCarte!.x + boiteDeLaCarte!.width)
    expect(
      mesures.texte!.y + mesures.texte!.height,
      "le texte de la valeur déborde de la hauteur de sa carte"
    ).toBeLessThanOrEqual(boiteDeLaCarte!.y + boiteDeLaCarte!.height)
  })

  test("11. la taille de la valeur du CA suit la largeur de sa carte", async ({
    page,
    serveur,
  }) => {
    await ouvrirLeTableauDeBord(page, serveur.origine)

    const a390 = await mesurerLaValeur(laValeurDuCA(page))

    await page.setViewportSize({ width: 320, height: 568 })
    await attendreLaMiseEnPage(page)
    expect(page.viewportSize()).toEqual({ width: 320, height: 568 })

    const a320 = await mesurerLaValeur(laValeurDuCA(page))

    expect(a390.clientWidth).toBeGreaterThan(a320.clientWidth)
    const rapport390 = a390.fontSize / a390.clientWidth
    const rapport320 = a320.fontSize / a320.clientWidth
    expect(
      Math.abs(rapport390 - rapport320) / rapport390,
      `la taille de la valeur ne suit pas la carte : ${a390.fontSize} px pour ${a390.clientWidth} px à 390, ${a320.fontSize} px pour ${a320.clientWidth} px à 320`
    ).toBeLessThan(0.02)
  })
})
