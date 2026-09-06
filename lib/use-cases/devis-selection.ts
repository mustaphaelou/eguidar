"use client"

/**
 * Sélection du Devis — porte d'entrée cliente, qui ne porte que le crochet.
 *
 * Le pur partagé (`SelectionDevis`, `Devis`, `selectionnerDevis`,
 * `lignesDevis`) vit dans le cœur neutre `@/lib/use-cases/devis-coeur`
 * (sans directive), consommé aussi côté serveur (`chargerDevis`, pages
 * Panier/Checkout, `placeOrder`). Définir ce pur ici — module « use
 * client » — faisait lever la production dès qu'un serveur l'appelait
 * (« Attempted to call selectionnerDevis() from the server… », /panier
 * « This page couldn't load »). Ce module réexporte donc le pur depuis le
 * cœur : les consommateurs clients existants (`checkout-form.tsx` via
 * `useDevisSelection`) gardent la même couture.
 *
 * Ne doit jamais importer `@/lib/db` (ni aucun module qui l'importe) :
 * consommé directement par les composants clients pour la re-sélection
 * instantanée de la Ville de livraison. Un import serveur ici
 * réintroduirait `pg` (`require('dns')`) dans le bundle navigateur et
 * casserait `next build` (Turbopack). L'entrée async (`chargerDevis`,
 * accès base via l'administration Livraison) reste dans
 * `@/lib/use-cases/devis` — les composants clients importent ce module-ci,
 * jamais l'entrée serveur.
 *
 * La re-sélection est un état local côté client, volontairement non
 * synchronisé avec l'URL : `useDevisSelection` initialise la Ville de
 * livraison depuis le Devis chargé puis re-chiffre le Récapitulatif de
 * paiement instantanément à chaque `choisir(villeId)`, sans rechargement.
 * `selectionnerDevis` et `lignesDevis` restent exportées comme coutures
 * internes ; le hook est la porte d'entrée cliente.
 *
 * Non-buts : pas de re-sélection synchronisée avec l'URL sur checkout ;
 * pas d'entrée de sélection allégée à côté de `chargerDevis` — `placeOrder`
 * garde `chargerDevis` et rétrécit l'union.
 */
import { useState } from "react"

import type { RécapitulatifRow } from "@/lib/recapitulatif-paiement"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"
import {
  createDevisHolder,
  creerDevisHolder,
  DeliveryCityNotFoundError,
  lignesDevis,
  selectionnerDevis,
  type Devis,
  type DevisHolder,
  type DevisHolderInit,
  type DevisPrecedenceSources,
  type SelectionDevis,
  type ValidatedSelectionDevis,
} from "@/lib/use-cases/devis-coeur"

export {
  createDevisHolder,
  creerDevisHolder,
  DeliveryCityNotFoundError,
  lignesDevis,
  selectionnerDevis,
} from "@/lib/use-cases/devis-coeur"
export type {
  Devis,
  DevisHolder,
  DevisHolderInit,
  DevisPrecedenceSources,
  SelectionDevis,
  ValidatedSelectionDevis,
} from "@/lib/use-cases/devis-coeur"

/**
 * Re-sélection du Devis côté client — porte d'entrée cliente du module.
 *
 * Possède l'état de la Ville de livraison sélectionnée (initialisé depuis
 * le Devis chargé) et expose `{ villes, selection, rows, choisir(villeId) }`.
 * Chaque `choisir` re-chiffre les lignes instantanément depuis le
 * `sousTotal` propre du Devis (`lignesDevis(devis.sousTotal, selection)`),
 * sur la même couture pure que `chargerDevis` — l'invariant
 * « jamais à moitié » vit ici, en un seul endroit.
 *
 * `choisir("")` retombe sur le cas « aucune » ; un identifiant inconnu
 * retombe aussi sur « aucune » — jamais à moitié, ne lève jamais.
 * État local volontairement non synchronisé avec l'URL.
 */
function isDevisHolder(devis: Devis | DevisHolder): devis is DevisHolder {
  return "choisir" in devis && typeof devis.choisir === "function"
}

export function useDevisSelection(devis: Devis | DevisHolder): {
  villes: DeliveryCityOption[]
  selection: SelectionDevis
  rows: RécapitulatifRow[]
  choisir(villeId: string): void
  recalculer(
    nouveauSousTotalOuInput:
      | number
      | { sousTotal: number; anyFreeShippingItem?: boolean }
  ): void
  villeId: string | null
} {
  const [localChoice, setLocalChoice] = useState<string | null>(null)
  const [hasChosen, setHasChosen] = useState<boolean>(false)

  const baseHolder = isDevisHolder(devis) ? devis : creerDevisHolder(devis)
  const activeHolder = hasChosen ? baseHolder.choisir(localChoice) : baseHolder

  return {
    villes: activeHolder.villes,
    selection: activeHolder.selection,
    rows: activeHolder.rows,
    villeId: activeHolder.villeId,
    choisir: (nouvelleVilleId: string) => {
      setHasChosen(true)
      setLocalChoice(nouvelleVilleId)
    },
    recalculer: () => {
      // Re-pricing is automatic on render from baseHolder
    },
  }
}
