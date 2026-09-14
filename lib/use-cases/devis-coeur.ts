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
 * Deux formes cohabitent : le Devis chargé (`DevisChargé`) est la donnée
 * pure qui traverse la couture serveur → client — Villes de livraison,
 * seuil, devis par ville, sous-total, sources de précédence, aucune
 * fonction — ; l'interface `DevisHolder` (getters, `choisir`,
 * `selectionValidee`) n'est pas une donnée : elle se construit derrière
 * la couture à partir de ces faits via `creerDevisHolder(devisChargé)` —
 * une seule entrée de construction, les devis étant toujours fournis par
 * l'appelant (la fabrique ne chiffre jamais).
 *
 * Deux résolutions pures accompagnent la Sélection : `villeInitiale`
 * (précédence lien > profil > aucune) et `selectionValidee`
 * (rétrécissement de prise en commande, refuse « aucune »).
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
 * Le Devis chargé : les faits purs d'un Panier chiffré — Villes de
 * livraison, seuil de livraison offerte, devis par ville, sous-total
 * (cents) et sources de précédence (`urlVilleId` gagne sur
 * `profileVilleId`). Strictement des données : aucune fonction, aucun
 * getter, aucune instance de classe — c'est ce qui traverse la couture
 * serveur → client. L'interface `DevisHolder` (getters, `choisir`,
 * `selectionValidee`) se construit derrière la couture à partir de ces
 * faits via `creerDevisHolder`.
 */
export type DevisChargé = {
  cities: DeliveryCityOption[]
  threshold: number
  quotes: Record<string, ShippingQuote>
  sousTotal: number
  sources?: DevisPrecedenceSources
}

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
 * Sources de précédence pour la ville initiale d'une Sélection
 * (`villeInitiale`).
 *
 * `urlVilleFournie` dit la **présence** d'un `?ville=` non vide dans l'URL :
 * le lien partagé l'emporte alors, et une ville inconnue laisse la sélection
 * « aucune » (pas de repli sur le profil). Sans ce fait — appelants
 * existants, chaîne simple de `chargerDevis` — `urlVilleId` l'emporte
 * quand il est renseigné, le profil sauvegardé (`profileVilleId`) sert de
 * repli si le lien est absent ou vide.
 */
export interface DevisPrecedenceSources {
  urlVilleId?: string | null
  urlVilleFournie?: boolean
  profileVilleId?: string | null
}

/**
 * Ville initiale dérivée des seules sources de précédence : lien >
 * profil > aucune.
 *
 * Sans sources → null. Un lien explicitement fourni l'emporte — rogné,
 * ou null s'il est vide — sans repli sur le profil, même s'il nomme une
 * ville inconnue (la Sélection résoudra alors « aucune »). Sinon un
 * `urlVilleId` rogné non vide gagne, un `profileVilleId` rogné non vide
 * sert de repli, sinon null.
 */
export function villeInitiale(
  sources?: DevisPrecedenceSources
): string | null {
  if (!sources) return null
  if (sources.urlVilleFournie) return sources.urlVilleId?.trim() || null
  const url = sources.urlVilleId?.trim()
  if (url && url.length > 0) return url
  const profil = sources.profileVilleId?.trim()
  if (profil && profil.length > 0) return profil
  return null
}

/**
 * Interface profonde du DevisHolder : possède les villes, la sélection
 * courante, les lignes du Récapitulatif projetées depuis le sous-total
 * du Devis chargé qui l'a construit, le changement de ville (`choisir`),
 * l'identifiant sélectionné (`villeId`) et le rétrécissement de prise en
 * commande (`selectionValidee`).
 *
 * Les devis bruts (`quotes`) et le seuil (`threshold`) restent cachés
 * dans l'implémentation — le holder n'expose que la projection.
 */
export interface DevisHolder {
  readonly villes: DeliveryCityOption[]
  readonly selection: SelectionDevis
  readonly rows: RécapitulatifRow[]
  readonly villeId: string | null
  choisir(nouvelleVilleId?: string | null): DevisHolder
  selectionValidee(): ValidatedSelectionDevis
}

/**
 * Construit le DevisHolder depuis le Devis chargé — l'unique entrée de
 * construction de l'interface : les faits entrants sont exactement le
 * Devis chargé, et les devis par ville (`quotes`) sont toujours fournis
 * par l'appelant — la fabrique ne chiffre jamais.
 *
 * La précédence (lien > profil > aucune) est résolue par `villeInitiale`
 * à la construction. Ville inconnue ou absente → sélection « aucune » ;
 * la fabrique ne lève jamais sur une ville absente ou inconnue.
 */
export function creerDevisHolder(devisChargé: DevisChargé): DevisHolder {
  const { cities, quotes, sousTotal } = devisChargé

  function creerInstance(villeChoisie: string | null): DevisHolder {
    const selection = selectionnerDevis(cities, quotes, villeChoisie)
    const rows = lignesDevis(sousTotal, selection)
    const villeId = selection.cas === "validée" ? selection.ville.id : null

    return {
      get villes() {
        return cities
      },
      get selection() {
        return selection
      },
      get rows() {
        return rows
      },
      get villeId() {
        return villeId
      },
      choisir(nouvelleVilleId?: string | null) {
        const trimmed = nouvelleVilleId?.trim() || null
        return creerInstance(trimmed)
      },
      selectionValidee() {
        return selectionValidee(selection)
      },
    }
  }

  const initialCityId = villeInitiale(devisChargé.sources)
  return creerInstance(initialCityId)
}

/**
 * Le Devis projeté — surface externe du cœur pur.
 *
 * Seul endroit où les consommateurs dérivent les Villes de livraison, la
 * Sélection du Devis, les lignes du Récapitulatif et l'identifiant de la
 * ville sélectionnée : une projection pure depuis le Devis chargé et une
 * Ville de livraison explicite (ou aucune). Les devis bruts (`quotes`) et
 * le seuil (`threshold`) restent cachés derrière la projection ; les
 * coutures internes (`selectionnerDevis`, `lignesDevis`) gardent leurs
 * tests directs.
 */
export type DevisProjeté = {
  villes: DeliveryCityOption[]
  selection: SelectionDevis
  rows: RécapitulatifRow[]
  villeId: string | null
}

/**
 * Projette le Devis projeté depuis un Devis chargé et la Ville de
 * livraison choisie (ou aucune).
 *
 * Compose les coutures internes : `selectionnerDevis` résout la ville,
 * `lignesDevis` dérive les lignes du `sousTotal` porté. Ville inconnue,
 * absente ou vide → « aucune » : jamais à moitié, ne lève jamais.
 */
export function projeterDevis(
  devisChargé: DevisChargé,
  villeId?: string | null
): DevisProjeté {
  const selection = selectionnerDevis(
    devisChargé.cities,
    devisChargé.quotes,
    villeId
  )
  const rows = lignesDevis(devisChargé.sousTotal, selection)

  return {
    villes: devisChargé.cities,
    selection,
    rows,
    villeId: selection.cas === "validée" ? selection.ville.id : null,
  }
}

