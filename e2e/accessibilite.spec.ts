import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures/sonde"
import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { ajouterUnArticleAuPanier, VILLE_DE_LA_SONDE } from "./harnais/panier"

function declencheurDuPanier(page: Page): Locator {
  return page.locator("header").getByRole("button", { name: /^Panier/ })
}

function rangeeLegale(page: Page): Locator {
  return page.locator('[data-slot="rangée-légale"]')
}

function rapportDeContraste(texte: Locator): Promise<number> {
  return texte.evaluate((element) => {
    const toile = document.createElement("canvas")
    toile.width = 1
    toile.height = 1
    const contexte = toile.getContext("2d")
    if (contexte === null) throw new Error("le canevas 2D est indisponible")

    function lireUneCouleur(couleur: string): {
      canaux: [number, number, number]
      alpha: number
    } {
      contexte!.clearRect(0, 0, 1, 1)
      contexte!.fillStyle = "#000000"
      contexte!.fillStyle = couleur
      contexte!.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = contexte!.getImageData(0, 0, 1, 1).data
      return { canaux: [r, g, b], alpha: a / 255 }
    }

    function fondEffectif(depart: Element): [number, number, number] {
      const couches: { canaux: [number, number, number]; alpha: number }[] = []
      let noeud: Element | null = depart
      while (noeud !== null) {
        const couleur = lireUneCouleur(getComputedStyle(noeud).backgroundColor)
        if (couleur.alpha > 0) {
          couches.push(couleur)
          if (couleur.alpha >= 1) break
        }
        noeud = noeud.parentElement
      }

      let fond: [number, number, number] = [255, 255, 255]
      for (const couche of couches.reverse()) {
        fond = [
          Math.round(
            couche.alpha * couche.canaux[0] + (1 - couche.alpha) * fond[0]
          ),
          Math.round(
            couche.alpha * couche.canaux[1] + (1 - couche.alpha) * fond[1]
          ),
          Math.round(
            couche.alpha * couche.canaux[2] + (1 - couche.alpha) * fond[2]
          ),
        ]
      }
      return fond
    }

    function luminance([r, g, b]: [number, number, number]): number {
      const canal = (valeur: number): number => {
        const proportion = valeur / 255
        return proportion <= 0.04045
          ? proportion / 12.92
          : ((proportion + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
    }

    const couleurDuTexte = lireUneCouleur(getComputedStyle(element).color)
    const luminanceDuTexte = luminance(couleurDuTexte.canaux)
    const luminanceDuFond = luminance(fondEffectif(element))
    const [claire, sombre] =
      luminanceDuTexte > luminanceDuFond
        ? [luminanceDuTexte, luminanceDuFond]
        : [luminanceDuFond, luminanceDuTexte]

    return (claire + 0.05) / (sombre + 0.05)
  })
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

test.describe("26. la typographie et les états de l'annuaire du Pied de page", () => {
  test("26a. le lien et le titre partagent la même recette", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const section = page.locator('[data-slot="section-pied-de-page"]').first()
    const lien = section.getByRole("link", {
      name: "Tous les produits",
      exact: true,
    })
    const titre = section.locator("h3").first()
    await expect(lien).toBeVisible()
    await expect(titre).toBeVisible()

    const mesurer = (element: Locator) =>
      element.evaluate((noeud) => {
        const style = getComputedStyle(noeud)
        return {
          taille: parseFloat(style.fontSize),
          interligne: parseFloat(style.lineHeight),
          interlettre: parseFloat(style.letterSpacing),
          graisse: style.fontWeight,
        }
      })

    const mesureDuLien = await mesurer(lien)
    const mesureDuTitre = await mesurer(titre)
    for (const mesure of [mesureDuLien, mesureDuTitre]) {
      expect(mesure.taille).toBe(12)
      expect(mesure.interligne).toBeCloseTo(16, 0)
      expect(mesure.interlettre).toBeCloseTo(-0.12, 1)
    }
    expect(mesureDuLien.graisse).toBe("400")
    expect(mesureDuTitre.graisse).toBe("600")

    const liste = await section
      .locator("summary")
      .evaluate((noeud) => getComputedStyle(noeud).listStyleType)
    expect(liste).toBe("none")
    expect(
      await titre.evaluate((noeud) => getComputedStyle(noeud).display)
    ).toBe("block")
  })

  test("26b. garde des cibles hautes et des états visibles", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const lien = page
      .locator('[data-slot="section-pied-de-page"]')
      .first()
      .getByRole("link", { name: "Tous les produits", exact: true })
    await expect(lien).toBeVisible()

    const boite = await lien.boundingBox()
    expect(boite, "le lien d'annuaire n'a pas de boîte").not.toBeNull()
    expect(
      boite!.height,
      `la cible du lien d'annuaire est trop basse (${boite!.height} px)`
    ).toBeGreaterThanOrEqual(28)

    const etatDuLien = () =>
      lien.evaluate((noeud) => {
        const style = getComputedStyle(noeud)
        return {
          paddingLeft: style.paddingLeft,
          opacity: style.opacity,
          transform: style.transform,
          decoration: style.textDecorationLine,
        }
      })

    const auRepos = await etatDuLien()
    expect(auRepos.paddingLeft).toBe("0px")
    expect(auRepos.opacity).toBe("1")
    expect(auRepos.transform).toBe("none")
    expect(auRepos.decoration).toBe("none")

    const contrasteAuRepos = await rapportDeContraste(lien)
    await lien.hover()
    const auSurvol = await etatDuLien()
    expect(auSurvol.decoration).toContain("underline")
    expect(
      await rapportDeContraste(lien),
      "le survol doit assombrir le lien d'annuaire"
    ).toBeGreaterThan(contrasteAuRepos)

    await page.mouse.down()
    const enAppui = await etatDuLien()
    await page.mouse.up()
    expect(parseFloat(enAppui.opacity)).toBeCloseTo(0.7, 1)
    expect(enAppui.transform).toBe("none")
  })
})

test.describe("27. les filets et le chevron des disclosures du Pied de page", () => {
  test("27a. trace un filet par ligne de disclosure sur téléphone", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const sections = page.locator('[data-slot="section-pied-de-page"]')
    await expect(sections).toHaveCount(4)
    const filets = await sections.evaluateAll((elements) =>
      elements.map((element) =>
        parseFloat(getComputedStyle(element).borderBottomWidth)
      )
    )
    expect(filets).toHaveLength(4)
    for (const filet of filets) {
      expect(
        filet,
        `un filet de disclosure mesure ${filet} px`
      ).toBeGreaterThan(0)
    }
  })

  test("27b. ne transitionne pas le chevron sous mouvement réduit", async ({
    page,
    serveur,
  }) => {
    await ouvrirLaBoutique(page, serveur.origine, "/")

    const chevrons = page.locator('[data-slot="chevron-pied-de-page"]')
    await expect(chevrons).toHaveCount(4)
    await expect(chevrons.first()).toBeVisible()
    const durees = await chevrons.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).transitionDuration)
    )
    expect(durees).toEqual(["0s", "0s", "0s", "0s"])
  })
})
