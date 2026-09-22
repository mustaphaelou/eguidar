"use client"

/**
 * Sélection du Devis — porte d'entrée cliente, qui ne porte que le crochet.
 *
 * La donnée qui traverse la couture serveur → client est le Devis chargé
 * (`DevisChargé`) : des faits purs — Villes de livraison, seuil de
 * livraison offerte, devis par ville, sous-total, Ville initiale — sans
 * fonction, sans getter, sans instance de classe. Le crochet fige ces
 * faits une seule fois et possède la seule machine à états de la
 * Sélection : il sème son état à la Ville initiale portée (la Précédence
 * du Devis — lien > profil > aucune — est déjà résolue par le chargeur,
 * jamais ré-ici) et projette le Devis projeté à chaque rendu
 * (`projeterDevis`) avec la Ville choisie, explicite. La projection est la
 * surface externe ; les coutures internes (`selectionnerDevis`,
 * `lignesDevis`) gardent leurs tests directs dans le cœur pur.
 *
 * Le pur partagé (`projeterDevis`, `selectionnerDevis`,
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
 *
 * Non-buts : pas de re-sélection synchronisée avec l'URL sur checkout ;
 * pas d'entrée de sélection allégée à côté de `chargerDevis` — `placeOrder`
 * garde `chargerDevis` et rétrécit l'union.
 */
import { useState } from "react"

import type { RécapitulatifRow } from "@/lib/recapitulatif-paiement"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"
import {
  projeterDevis,
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
 * Fige les faits chargés une seule fois (les changements ultérieurs du
 * Devis chargé sont ignorés), démarre à la Ville initiale portée par ce
 * Devis chargé — `string | null`, « aucune » comprise, Précédence déjà
 * résolue par le chargeur — puis projette le Devis projeté à chaque
 * rendu (`projeterDevis`) avec la Ville choisie ; expose
 * `{ villes, selection, rows, choisir(villeId), villeId }`. Chaque
 * `choisir` re-projette les lignes instantanément.
 *
 * `choisir(null)` dit explicitement « aucune » — l'absence est typée,
 * plus besoin de chaîne vide ; une chaîne vide ou un identifiant inconnu
 * retombent aussi sur « aucune » — jamais à moitié, ne lève jamais.
 * État local volontairement non synchronisé avec l'URL.
 */
export function useDevisSelection(devisChargé: DevisChargé): {
  villes: DeliveryCityOption[]
  selection: SelectionDevis
  rows: RécapitulatifRow[]
  choisir(villeId: string | null): void
  villeId: string | null
} {
  const [chargé] = useState(devisChargé)
  const [villeChoisie, setVilleChoisie] = useState<string | null>(
    chargé.villeInitiale
  )

  const projet = projeterDevis(chargé, villeChoisie)

  return {
    villes: projet.villes,
    selection: projet.selection,
    rows: projet.rows,
    villeId: projet.villeId,
    choisir: (villeId: string | null) => {
      setVilleChoisie(villeId)
    },
  }
}
