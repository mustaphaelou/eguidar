import { describe, expect, it } from "vitest"

import { TYPES_EVENEMENT_AUTOMATION } from "@/lib/automations/evenements"
import {
  ACTIONS_AUTOMATION,
  actionsOffertes,
  CombinaisonRefusee,
  conditionsOffertes,
  DECLENCHEURS_AUTOMATION,
  declencheursOfferts,
  ENTITE_OBSERVEE_PAR_DECLENCHEUR,
  ENTITES_ECRITES_PAR_ACTION,
  estNomDeVariableEnvironnement,
  filtrerSansBoucle,
  verifierCombinaison,
} from "@/lib/automations/vocabulaire"

describe("le vocabulaire fermé de l'éditeur de Règles", () => {
  it("n'offre à un déclencheur que les actions qu'il sait alimenter", () => {
    expect(actionsOffertes("commande.creee")).toEqual(["email.commande-creee"])
    expect(actionsOffertes("commande.statut.changee")).toEqual([
      "email.commande-statut",
    ])
    expect(actionsOffertes("produit.enregistre")).toEqual([
      "index.produit",
      "invalidation.catalogue",
      "purge.catalogue",
    ])
    expect(actionsOffertes("produit.supprime")).toEqual([
      "desindex.produit",
      "invalidation.catalogue",
    ])
    expect(actionsOffertes("variante.stock.changee")).toEqual(["index.produit"])
    expect(actionsOffertes("structure.modifiee")).toEqual([
      "invalidation.structure",
    ])
    expect(actionsOffertes("planification.digest-stock-bas")).toEqual([
      "digest.stock-bas",
      "digest.proprietaire",
    ])
    expect(actionsOffertes("planification.reconciliation-recherche")).toEqual([
      "reconciliation.recherche",
    ])
  })

  it("nomme la combinaison refusée plutôt que de dire « invalide »", () => {
    expect(() =>
      verifierCombinaison({
        declencheur: "produit.enregistre",
        condition: { type: "toujours" },
        action: "email.commande-statut",
      })
    ).toThrow(CombinaisonRefusee)

    expect(() =>
      verifierCombinaison({
        declencheur: "produit.enregistre",
        condition: { type: "toujours" },
        action: "email.commande-statut",
      })
    ).toThrow(
      "Combinaison non prise en charge : « Produit enregistré » (produit.enregistre) ne déclenche pas « E-mail de statut de Commande » (email.commande-statut)."
    )
  })

  it("n'offre jamais une action qui écrirait la table de son propre déclencheur", () => {
    for (const declencheur of TYPES_EVENEMENT_AUTOMATION) {
      const entite = ENTITE_OBSERVEE_PAR_DECLENCHEUR[declencheur]
      for (const action of actionsOffertes(declencheur)) {
        expect(ENTITES_ECRITES_PAR_ACTION[action]).not.toContain(entite)
      }
    }
  })

  it("écarte une action qui écrirait la table observée, avant même l'offre", () => {
    const offertes = filtrerSansBoucle(
      ["index.produit", "invalidation.structure"],
      { "index.produit": ["produit"], "invalidation.structure": ["categorie"] },
      "produit"
    )
    expect(offertes).toEqual(["invalidation.structure"])
  })

  it("n'admet la condition de statut que sur le changement de statut de Commande", () => {
    expect(conditionsOffertes("commande.statut.changee")).toEqual([
      "toujours",
      "statut-commande",
    ])
    expect(conditionsOffertes("commande.creee")).toEqual(["toujours"])

    expect(() =>
      verifierCombinaison({
        declencheur: "commande.creee",
        condition: { type: "statut-commande" },
        action: "email.commande-creee",
      })
    ).toThrow(
      "Combinaison non prise en charge : la condition « Statut de Commande » (statut-commande) ne s'évalue pas sur « Commande créée » (commande.creee)."
    )
  })

  it("refuse un destinataire hors d'un digest, et un nom de variable qui n'en est pas un", () => {
    expect(() =>
      verifierCombinaison({
        declencheur: "produit.enregistre",
        condition: { type: "toujours" },
        action: "index.produit",
        configuration: { destinataireVariable: "ADMIN_EMAIL" },
      })
    ).toThrow(
      "Combinaison non prise en charge : l'action « Indexer le Produit » (index.produit) n'admet pas de destinataire."
    )

    expect(estNomDeVariableEnvironnement("ADMIN_EMAIL")).toBe(true)
    expect(estNomDeVariableEnvironnement("admin_email")).toBe(false)
    expect(estNomDeVariableEnvironnement("https://exfiltration.example")).toBe(
      false
    )
    expect(estNomDeVariableEnvironnement("DESTINATAIRE SECRET")).toBe(false)
  })

  it("couvre exactement les déclencheurs que le travailleur connaît", () => {
    expect([...DECLENCHEURS_AUTOMATION].sort()).toEqual(
      [...TYPES_EVENEMENT_AUTOMATION].sort()
    )
  })

  it("n'offre que des déclencheurs connus pour une action", () => {
    for (const action of ACTIONS_AUTOMATION) {
      expect(declencheursOfferts(action).length).toBeGreaterThan(0)
    }
    expect(declencheursOfferts("email.commande-creee")).toEqual([
      "commande.creee",
    ])
  })
})
