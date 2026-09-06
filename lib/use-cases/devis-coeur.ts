/**
 * Cœur pur du Devis — module neutre, sans directive.
 *
 * NE JAMAIS ajouter `"use client"` ici : `selectionnerDevis` et
 * `lignesDevis` sont appelés côté serveur (`chargerDevis` dans
 * `@/lib/use-cases/devis`, pages Panier/Checkout, `placeOrder`). Importer
 * ces fonctions depuis le module client `devis-selection` faisait lever la
 * production (« Attempted to call selectionnerDevis() from the server… »)
 * et affichait « This page couldn't load » sur /panier.
 *
 * NE JAMAIS importer `@/lib/db` (ni aucun module qui l'importe) ici : ce
 * cœur est aussi consommé côté client (via `@/lib/use-cases/devis-selection`
 * → `useDevisSelection`) ; un import serveur y réintroduirait `pg`
 * (`require('dns')`) dans le bundle navigateur et casserait `next build`
 * (Turbopack).
 *
 * Le Devis est auto-porteur : il porte le `sousTotal` issu du Panier dont
 * il a été chargé ; les lignes du Récapitulatif se dérivent toujours via
 * le projecteur unique `lignesDevis(devis.sousTotal, devis)` — pages
 * serveur comme hook partagent la même couture.
 */
import {
  construireLignes,
  type RécapitulatifRow,
} from "@/lib/recapitulatif-paiement"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison-prix"

/**
 * Une Sélection du Devis répond par exactement un cas : **aucune** (rien
 * choisi, rien dû) ou **validée** (une Ville de livraison et son Devis,
 * toujours cohérents — jamais à moitié). Le cas validée porte exactement
 * deux faits : `ville` et `devis` ; l'identifiant se lit via
 * `ville.id` après rétrécissement.
 */
export type SelectionDevis =
  | { cas: "aucune" }
  | { cas: "validée"; ville: DeliveryCityOption; devis: ShippingQuote }

/**
 * Résolution pure du Devis : transforme des Villes de livraison déjà
 * récupérées plus leurs devis et un identifiant de ville demandé en une
 * Sélection du Devis.
 *
 * Identifiant connu AVEC devis existant ET ville existante → cas
 * « validée » (ville + devis). Identifiant absent / nul / inconnu, ou
 * identifiant connu sans devis ou sans ville → cas « aucune ».
 * Ne lève jamais, ne sélectionne jamais à moitié.
 * Résolution pure uniquement — indépendante du calcul des prix
 * (seuil, livraison offerte).
 */
export function selectionnerDevis(
  cities: DeliveryCityOption[],
  quotes: Record<string, ShippingQuote>,
  requestedCityId?: string | null
): SelectionDevis {
  const aucune: SelectionDevis = { cas: "aucune" }
  if (!requestedCityId) return aucune
  const devis = quotes[requestedCityId] ?? null
  if (!devis) return aucune
  const ville = cities.find((city) => city.id === requestedCityId)
  if (!ville) return aucune
  return { cas: "validée", ville, devis }
}

/**
 * Devis chargé : Villes de livraison, seuil et devis par ville, le
 * sous-total (cents) qui a chiffré les devis, et la Sélection du Devis
 * absorbée à plat (un seul test du discriminant `cas` rétrécit
 * `ville` + `devis`).
 *
 * Le Devis est auto-porteur : il porte le `sousTotal` issu du Panier
 * dont il a été chargé, pour que les surfaces d'affichage ne reçoivent
 * plus le sous-total comme un fait séparé qui pourrait dériver des
 * devis. Les lignes ne sont jamais cuites dans le type : elles se
 * dérivent toujours via le projecteur unique
 * `lignesDevis(devis.sousTotal, devis)`.
 */
export type Devis = {
  cities: DeliveryCityOption[]
  threshold: number
  quotes: Record<string, ShippingQuote>
  sousTotal: number
} & SelectionDevis

/**
 * Lignes du Récapitulatif de paiement pour une Sélection du Devis —
 * projecteur unique pour les pages serveur comme pour le hook.
 *
 * Détail interne du Devis (l'ancienne entrée Devis du Récapitulatif est
 * retirée) : cas « aucune » → « Livraison » + « À choisir » + Total omis ;
 * cas « validée » → « Livraison (Ville) » + frais + Total. La formulation
 * vit dans `construireLignes`, ici on ne fait que projeter la sélection.
 * Ne lève jamais.
 */
export function lignesDevis(
  sousTotal: number,
  selection: SelectionDevis
): RécapitulatifRow[] {
  if (selection.cas === "aucune") {
    return construireLignes({
      sousTotal,
      shipping: null,
      total: null,
    })
  }

  return construireLignes({
    sousTotal,
    shipping: {
      fee: selection.devis.shippingFee,
      city: selection.ville.name,
    },
    total: selection.devis.total,
  })
}
