import {
  attendreLaPagePrete,
  attendreLeCompteurDuPanier,
} from "./harnais/attente"
import {
  NOM_COURT_DE_PRODUIT_DE_FIXTURE,
  NOM_LONG_DE_PRODUIT_DE_FIXTURE,
  NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION,
} from "./harnais/commandes-de-fixture"
import { ajouterUnArticleAuPanier, cheminDuCheckout } from "./harnais/panier"
import { FICHIER_DE_SESSION } from "./harnais/session"
import { expect, test } from "./fixtures/sonde"

/**
 * Les surfaces derrière une Session courante : le Récapitulatif du Checkout, la
 * confirmation d'une Commande semée à deux Articles, et le CA encaissé de
 * l'Administration. L'état de session vient du projet « preparation », joué
 * avant celui-ci et enregistré une seule fois dans `e2e/.auth/`.
 *
 * Ce fichier ne prouve que l'**atteinte** de ces surfaces. Les assertions de
 * mise en page (un montant sur une ligne, une valeur qui tient dans sa carte)
 * appartiennent aux tickets #930/#931/#932 : elles échoueraient ici avant
 * leurs correctifs.
 */
test.use({ storageState: FICHIER_DE_SESSION })

test.describe("les surfaces authentifiées de la sonde", () => {
  test("le Récapitulatif du Checkout en Session courante", async ({
    page,
    serveur,
  }) => {
    // Le Checkout exige un Panier non vide : l'Article est ajouté par le vrai
    // parcours de la fiche, dans le contexte déjà authentifié.
    await ajouterUnArticleAuPanier(page, serveur.origine)

    const montageDuPanier = attendreLeCompteurDuPanier(page)
    const reponse = await page.goto(`${serveur.origine}${cheminDuCheckout()}`, {
      waitUntil: "domcontentloaded",
    })
    expect(reponse?.status()).toBe(200)
    await attendreLaPagePrete(page, montageDuPanier)

    await expect(page).toHaveURL(/\/checkout\?ville=casablanca$/)
    // Le flux de rendu de Next peut laisser un instant une copie hors du
    // `<main>` (elle disparaît à l'hydratation) : la surface que le Client lit
    // est celle du document principal.
    const principal = page.getByRole("main")
    await expect(
      principal.getByRole("heading", { name: "Commander", level: 1 })
    ).toBeVisible()
    await expect(
      principal.getByText("Total à payer à la livraison")
    ).toBeVisible()
  })

  test("la confirmation de la Commande semée à deux Articles", async ({
    page,
    serveur,
  }) => {
    const montageDuPanier = attendreLeCompteurDuPanier(page)
    const reponse = await page.goto(
      `${serveur.origine}/commande/confirmation/${NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION}`,
      { waitUntil: "domcontentloaded" }
    )
    expect(reponse?.status()).toBe(200)
    await attendreLaPagePrete(page, montageDuPanier)

    const principal = page.getByRole("main")
    await expect(
      principal.getByRole("heading", { name: "Merci pour votre commande" })
    ).toBeVisible()

    const lignes = principal.getByRole("listitem")
    await expect(lignes).toHaveCount(2)
    await expect(
      lignes.filter({ hasText: NOM_LONG_DE_PRODUIT_DE_FIXTURE })
    ).toHaveCount(1)
    await expect(
      lignes.filter({ hasText: NOM_COURT_DE_PRODUIT_DE_FIXTURE })
    ).toHaveCount(1)
    await expect(
      principal.getByText(NOM_LONG_DE_PRODUIT_DE_FIXTURE)
    ).toBeVisible()
  })

  test("le tableau de bord de l'Administration et son CA encaissé", async ({
    page,
    serveur,
  }) => {
    const reponse = await page.goto(`${serveur.origine}/admin`, {
      waitUntil: "domcontentloaded",
    })
    expect(reponse?.status()).toBe(200)
    await attendreLaPagePrete(page)

    await expect(
      page.getByRole("main").getByRole("heading", { name: "Tableau de bord" })
    ).toBeVisible()

    // Le CA encaissé est la somme des Commandes Livrées sur 30 jours
    // (ADR-0009) : la seule Commande livrée de la base est celle de fixture.
    const indicateurs = page.getByRole("region", {
      name: "Indicateurs principaux",
    })
    await expect(indicateurs).toBeVisible()
    await expect(
      indicateurs.getByText("CA encaissé", { exact: true })
    ).toBeVisible()
    await expect(indicateurs.getByText(/15[.\s]?998,00\s*MAD/)).toBeVisible()
  })
})
