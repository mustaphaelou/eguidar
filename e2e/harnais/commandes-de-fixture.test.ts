import { describe, expect, it } from "vitest"

import {
  construireLesCommandesDeFixture,
  NOM_COURT_DE_PRODUIT_DE_FIXTURE,
  NOM_LONG_DE_PRODUIT_DE_FIXTURE,
  NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION,
  NUMERO_DE_LA_COMMANDE_LIVREE,
  TOTAL_DE_LA_COMMANDE_DE_CONFIRMATION,
  TOTAL_DE_LA_COMMANDE_LIVREE,
} from "./commandes-de-fixture"

const MAINTENANT = new Date("2026-11-06T12:00:00.000Z")

describe("les Commandes de fixture de la sonde", () => {
  it("portent des identifiants fixes, lisibles dans une assertion", () => {
    expect(NUMERO_DE_LA_COMMANDE_LIVREE).toBe("e2e-commande-livree-923")
    expect(NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION).toBe(
      "e2e-commande-confirmation-923"
    )
  })

  it("la Commande Livrée dépasse 15 000 MAD et appartient à l'administrateur", () => {
    const [livree] = construireLesCommandesDeFixture("compte-admin", MAINTENANT)

    expect(livree).toMatchObject({
      id: NUMERO_DE_LA_COMMANDE_LIVREE,
      userId: "compte-admin",
      status: "delivered",
      totalPayable: TOTAL_DE_LA_COMMANDE_LIVREE,
      createdAt: MAINTENANT,
    })
    // 15 000 MAD = 1 500 000 centimes ; le CA de l'Administration doit le dépasser.
    expect(TOTAL_DE_LA_COMMANDE_LIVREE).toBeGreaterThan(1_500_000)
    expect(livree.total + livree.shippingFee).toBe(livree.totalPayable)
  })

  it("la Commande de confirmation porte deux Articles dont un nom long, sans entrer dans le CA", () => {
    const [, confirmation] = construireLesCommandesDeFixture(
      "compte-admin",
      MAINTENANT
    )

    expect(confirmation).toMatchObject({
      id: NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION,
      userId: "compte-admin",
      totalPayable: TOTAL_DE_LA_COMMANDE_DE_CONFIRMATION,
      createdAt: MAINTENANT,
    })
    // Un statut non encaissé : le CA vaut exactement la Commande Livrée.
    expect(confirmation.status).not.toBe("delivered")
    expect(confirmation.items).toHaveLength(2)
    expect(confirmation.items.map((article) => article.productName)).toEqual([
      NOM_LONG_DE_PRODUIT_DE_FIXTURE,
      NOM_COURT_DE_PRODUIT_DE_FIXTURE,
    ])
    expect(NOM_LONG_DE_PRODUIT_DE_FIXTURE.length).toBeGreaterThan(50)
    expect(
      confirmation.items.reduce(
        (somme, article) => somme + article.price * article.quantity,
        0
      )
    ).toBe(confirmation.total)
    expect(confirmation.total + confirmation.shippingFee).toBe(
      confirmation.totalPayable
    )
  })
})
