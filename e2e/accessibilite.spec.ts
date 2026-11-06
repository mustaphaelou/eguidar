import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./fixtures/sonde"
import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import { ajouterUnArticleAuPanier, VILLE_DE_LA_SONDE } from "./harnais/panier"

/**
 * Les trois corrections d'accessibilité nommées par Lighthouse (matrice de la
 * spec #923, lignes 20 à 22) : le nom accessible du déclencheur du Panier, la
 * cible des liens légaux du Pied de page et le contraste du vert.
 *
 * La sonde ne lit que ce qu'un Client observe : le nom accessible que calcule
 * le navigateur, les boîtes réelles des liens, et des couleurs calculées
 * passées par un canevas pour obtenir des composantes sRGB. Aucun attribut
 * introduit par le correctif n'est requis, aucun coureur `axe` n'est ajouté :
 * le contraste se calcule ici, avec l'API du navigateur.
 */

/** Le déclencheur du Panier, trouvé par son nom accessible d'avant le ticket. */
function declencheurDuPanier(page: Page): Locator {
  return page.locator("header").getByRole("button", { name: /^Panier/ })
}

/**
 * La rangée légale du Pied de page, repérée par son texte de copyright. Le
 * `last()` choisit le `div` le plus profond qui porte ce texte : la rangée
 * elle-même, pas la section qui contient aussi les liens « En savoir plus » et
 * « Voir les tarifs » des paragraphes voisins.
 */
function rangeeLegale(page: Page): Locator {
  return page
    .getByRole("contentinfo")
    .locator("div")
    .filter({ hasText: "Le code est sous" })
    .last()
}

/**
 * Le ratio de contraste WCAG entre la couleur du texte et le fond effectif,
 * mesuré dans le navigateur. Les couleurs calculées du dépôt sortent en
 * `lab()` ou `oklch()` : un canevas 2D les convertit en composantes sRGB (et
 * rend l'alpha), puis on remonte les ancêtres jusqu'à un fond opaque. Le
 * rapport est calculé sur les luminances relatives WCAG : (L1 + 0,05) /
 * (L2 + 0,05), la plus claire au numérateur.
 */
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

      // Composite du plus extérieur au plus proche, sur le blanc de la page.
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
    // Sans Article, le nom reste « Panier » : ni vide, ni réduit à un nombre.
    await expect(declencheur).toHaveAccessibleName("Panier")
  })

  test("20b. après un ajout, il annonce « Panier » et le nombre d'Articles", async ({
    page,
    serveur,
  }) => {
    await ajouterUnArticleAuPanier(page, serveur.origine)

    const declencheur = declencheurDuPanier(page)
    await expect(declencheur).toBeVisible()
    // Aujourd'hui la pastille porte visiblement « 1 » alors que l'étiquette
    // écrase le contenu : le nom doit être « Panier » suivi du nombre.
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
    await expect(liens).toHaveCount(6)

    const libelles = [
      "licence MIT",
      "À propos",
      "Contact",
      "FAQ",
      "Blog",
      "Conditions & livraison",
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
