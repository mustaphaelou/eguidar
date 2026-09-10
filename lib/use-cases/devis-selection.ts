"use client"

/**
 * Sélection du Devis — porte d'entrée cliente, qui ne porte que le crochet.
 *
 * La donnée qui traverse la couture serveur → client est le Devis chargé
 * (`DevisChargé`) : des faits purs — Villes de livraison, seuil de
 * livraison offerte, devis par ville, sous-total, sources de précédence —
 * sans fonction, sans getter, sans instance de classe. Le hook prend ces
 * faits et construit l'interface profonde `DevisHolder` derrière la
 * couture (via `creerDevisHolder`) : la précédence (lien > profil >
 * aucune) vit dans la fabrique, jamais dans la page.
 *
 * Le pur partagé (`SelectionDevis`, `selectionnerDevis`, `lignesDevis`)
 * vit dans le cœur neutre `@/lib/use-cases/devis-coeur`
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
 * `selectionnerDevis` et `lignesDevis` restent exportées par le cœur
 * comme coutures internes ; le hook est la porte d'entrée cliente.
 *
 * Non-buts : pas de re-sélection synchronisée avec l'URL sur checkout ;
 * pas d'entrée de sélection allégée à côté de `chargerDevis` — `placeOrder`
 * garde `chargerDevis` et rétrécit l'union.
 */
import { useState } from "react"

import type { RécapitulatifRow } from "@/lib/recapitulatif-paiement"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"
import {
  creerDevisHolder,
  type DevisChargé,
  type SelectionDevis,
} from "@/lib/use-cases/devis-coeur"

export type {
  DevisChargé,
  SelectionDevis,
} from "@/lib/use-cases/devis-coeur"

/**
 * Re-sélection du Devis côté client — porte d'entrée cliente du module.
 *
 * Prend le Devis chargé (la donnée pure qui a traversé la couture) et
 * construit le DevisHolder une seule fois derrière la couture ; possède
 * l'état de la Ville de livraison sélectionnée (initialisé depuis la
 * précédence du Devis chargé : lien > profil > aucune) et expose
 * `{ villes, selection, rows, choisir(villeId), villeId }`. Chaque
 * `choisir` délègue au holder qui dérive les lignes instantanément.
 *
 * `choisir("")` retombe sur le cas « aucune » ; un identifiant inconnu
 * retombe aussi sur « aucune » — jamais à moitié, ne lève jamais.
 * État local volontairement non synchronisé avec l'URL.
 */
export function useDevisSelection(devisChargé: DevisChargé): {
  villes: DeliveryCityOption[]
  selection: SelectionDevis
  rows: RécapitulatifRow[]
  choisir(villeId: string): void
  villeId: string | null
} {
  const [holder] = useState(() => creerDevisHolder(devisChargé))
  const [localChoice, setLocalChoice] = useState<string | null>(null)
  const [hasChosen, setHasChosen] = useState<boolean>(false)

  const activeHolder = hasChosen ? holder.choisir(localChoice) : holder

  return {
    villes: activeHolder.villes,
    selection: activeHolder.selection,
    rows: activeHolder.rows,
    villeId: activeHolder.villeId,
    choisir: (nouvelleVilleId: string) => {
      setHasChosen(true)
      setLocalChoice(nouvelleVilleId)
    },
  }
}
