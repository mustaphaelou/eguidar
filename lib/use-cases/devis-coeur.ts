/**
 * Cœur pur du Devis — module neutre, sans directive.
 *
 * NE JAMAIS ajouter `"use client"` ici : `projeterDevis` et
 * `selectionValidee` sont appelés côté serveur — les pages lisent à travers
 * la porte `@/lib/use-cases/devis` (`lireDevis` compose la charge puis la
 * projection) et `placeOrder` compose `projeterDevis` avec une Ville
 * explicite puis `selectionValidee` — ce cœur est aussi consommé côté
 * client via `@/lib/use-cases/devis-selection`. Définir ce pur dans le
 * module client `devis-selection` faisait lever la production (« Attempted
 * to call selectionnerDevis() from the server… ») et affichait « This page
 * couldn't load » sur /panier.
 *
 * NE JAMAIS importer `@/lib/db` (ni aucun module qui l'importe) ici : ce
 * cœur est aussi consommé côté client (via `@/lib/use-cases/devis-selection`
 * → `useDevisSelection`) ; un import serveur y réintroduirait `pg`
 * (`require('dns')`) dans le bundle navigateur et casserait `next build`
 * (Turbopack).
 *
 * Deux formes cohabitent : le Devis chargé (`DevisChargé`) est la donnée
 * pure qui traverse la couture serveur → client — Villes de livraison,
 * seuil, devis par ville, sous-total, Ville initiale, aucune fonction — ;
 * le Devis projeté (`DevisProjeté`) est la surface dérivée qui se
 * projette derrière la couture via `projeterDevis(devisChargé, villeId)`
 * — la Ville y est toujours explicite et les devis restent toujours
 * fournis par l'appelant (le projecteur ne chiffre jamais).
 *
 * La Précédence du Devis (lien > profil > aucune) appartient au chargeur
 * `chargerDevis` (`@/lib/use-cases/devis`) : il en porte le résultat comme
 * la Ville initiale du Devis chargé. `selectionValidee` accompagne la
 * Sélection (rétrécissement de prise en commande, refuse « aucune »). Le
 * langage d'URL de la Ville — écriture `villeVersParam`, lecture
 * `resoudreVilleUrl` — vit dans `@/lib/use-cases/ville-url`.
 *
 * Le Devis est auto-porteur : il porte le `sousTotal` issu du Panier dont
 * il a été chargé ; les Villes de livraison, la Sélection du Devis, les
 * lignes du Récapitulatif et l'identifiant de la ville sélectionnée se
 * dérivent par la projection unique `projeterDevis` — les pages lisent le
 * projeté à travers la Lecture du Devis (`lireDevis`, qui compose la
 * charge puis cette projection) et le hook la relance côté client. Le
 * projecteur est la surface d'entrée du cœur et sa surface de test : les
 * suites passent par `projeterDevis`, jamais par une couture interne
 * (`selectionnerDevis`, `lignesDevis`), devenue privée.
 */
import {
  construireLignes,
  type RécapitulatifRow,
} from "@/lib/recapitulatif-paiement"
import {
  DeliveryCityNotFoundError,
  type DeliveryCityOption,
  type ShippingQuote,
} from "@/lib/use-cases/livraison-prix"

export { DeliveryCityNotFoundError }

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
function selectionnerDevis(
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
 * Le Devis chargé : les faits purs d'un Panier chiffré — Villes de
 * livraison, seuil de livraison offerte, devis par ville, sous-total
 * (cents) et Ville initiale (`villeInitiale : string | null`, « aucune »
 * comprise) — la Précédence du Devis (lien > profil > aucune) résolue une
 * seule fois par le chargeur seul à partir des faits bruts. Strictement
 * des données : aucune fonction, aucun getter, aucune instance de classe —
 * c'est ce qui traverse la couture serveur → client. Le Devis projeté
 * (`projeterDevis`) se dérive derrière la couture à partir de ces faits et
 * d'une Ville de livraison explicite.
 */
export type DevisChargé = {
  cities: DeliveryCityOption[]
  threshold: number
  quotes: Record<string, ShippingQuote>
  sousTotal: number
  villeInitiale: string | null
}

/**
 * Lignes du Récapitulatif de paiement pour une Sélection du Devis —
 * couture interne du cœur, atteinte uniquement via `projeterDevis`.
 *
 * Détail interne du Devis (l'ancienne entrée Devis du Récapitulatif est
 * retirée) : cas « aucune » → « Livraison » + « À choisir » + Total omis ;
 * cas « validée » → « Livraison (Ville) » + frais + Total. La formulation
 * vit dans `construireLignes`, ici on ne fait que projeter la sélection.
 * Ne lève jamais.
 */
function lignesDevis(
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

/**
 * Cas validé de la Sélection du Devis (ville + devis).
 */
export type ValidatedSelectionDevis = Extract<SelectionDevis, { cas: "validée" }>

/**
 * Rétrécissement de prise en commande : rend la Sélection validée
 * inchangée, ou refuse le cas « aucune » avec
 * `DeliveryCityNotFoundError` (erreur utilisateur existante).
 */
export function selectionValidee(
  selection: SelectionDevis
): ValidatedSelectionDevis {
  if (selection.cas !== "validée") {
    throw new DeliveryCityNotFoundError()
  }
  return selection
}

/**
 * Le Devis projeté — surface externe du cœur pur.
 *
 * Seul endroit où les consommateurs dérivent les Villes de livraison, la
 * Sélection du Devis, les lignes du Récapitulatif et l'identifiant de la
 * ville sélectionnée : une projection pure depuis le Devis chargé et une
 * Ville de livraison explicite (`string | null`, « aucune » comprise).
 * Les devis bruts (`quotes`) et le seuil (`threshold`) restent cachés
 * derrière la projection ; les coutures internes (`selectionnerDevis`,
 * `lignesDevis`) sont privées : le projecteur est la surface de test du
 * cœur.
 */
export type DevisProjeté = {
  villes: DeliveryCityOption[]
  selection: SelectionDevis
  rows: RécapitulatifRow[]
  villeId: string | null
}

/**
 * Projette le Devis projeté depuis un Devis chargé et la Ville de
 * livraison choisie.
 *
 * La Ville est **requise** : une chaîne est un choix explicite, `null` est
 * l'« aucune » typée — aucun mode « dérive-la-moi ». Compose les coutures
 * internes : `selectionnerDevis` résout la ville sur l'identifiant déjà
 * rogné (le rognage du caller vit ici, une seule fois ; le lookup lui fait
 * confiance), `lignesDevis` dérive les lignes du `sousTotal` porté. Ville
 * inconnue, vide ou entourée d'espaces → « aucune » : jamais à moitié, ne
 * lève jamais. La Précédence du Devis ne se dérive jamais ici — elle est
 * déjà portée par le Devis chargé (`villeInitiale`), résolue par le
 * chargeur.
 */
export function projeterDevis(
  devisChargé: DevisChargé,
  villeId: string | null
): DevisProjeté {
  const selection = selectionnerDevis(
    devisChargé.cities,
    devisChargé.quotes,
    villeId?.trim() || null
  )
  const rows = lignesDevis(devisChargé.sousTotal, selection)

  return {
    villes: devisChargé.cities,
    selection,
    rows,
    villeId: selection.cas === "validée" ? selection.ville.id : null,
  }
}

