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
import {
  computeCityQuotes,
  DEFAULT_FREE_SHIPPING_THRESHOLD,
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

/**
 * Cas validé de la Sélection du Devis (ville + devis).
 */
export type ValidatedSelectionDevis = Extract<SelectionDevis, { cas: "validée" }>

/**
 * Sources de précédence pour l'initialisation de la ville dans le DevisHolder :
 * le lien partagé (`urlVilleId`) l'emporte, le profil sauvegardé
 * (`profileVilleId`) sert de repli si le lien est absent ou vide.
 */
export interface DevisPrecedenceSources {
  urlVilleId?: string | null
  profileVilleId?: string | null
}

export interface DevisHolderInit {
  cities: DeliveryCityOption[]
  quotes?: Record<string, ShippingQuote>
  sousTotal: number
  threshold?: number
  anyFreeShippingItem?: boolean
  sources?: DevisPrecedenceSources
  urlVilleId?: string | null
  profileVilleId?: string | null
  requestedCityId?: string | null
}

/**
 * Interface profonde du DevisHolder : possède les villes, la sélection courante,
 * les lignes du Récapitulatif projetées depuis son propre sous-total,
 * le changement de ville (`choisir`), l'identifiant sélectionné (`villeId`),
 * le re-chiffrage sur changement de panier (`recalculer`),
 * et le rétrécissement de prise en commande (`selectionValidee` / `validerSelection`).
 *
 * Les devis bruts (`quotes`) et le seuil (`threshold`) restent cachés
 * dans l'implémentation.
 */
export interface DevisHolder {
  readonly villes: DeliveryCityOption[]
  readonly selection: SelectionDevis
  readonly rows: RécapitulatifRow[]
  readonly villeId: string | null
  choisir(nouvelleVilleId?: string | null): DevisHolder
  recalculer(
    nouveauSousTotalOuInput:
      | number
      | { sousTotal: number; anyFreeShippingItem?: boolean }
  ): DevisHolder
  selectionValidee(): ValidatedSelectionDevis
}

export function creerDevisHolder(init: DevisHolderInit): DevisHolder
export function creerDevisHolder(
  devis: Devis,
  sources?: string | null | DevisPrecedenceSources
): DevisHolder
export function creerDevisHolder(
  cities: DeliveryCityOption[],
  quotes: Record<string, ShippingQuote>,
  sousTotal: number,
  sources?: string | null | DevisPrecedenceSources
): DevisHolder
export function creerDevisHolder(
  citiesOrInitOrDevis: DeliveryCityOption[] | DevisHolderInit | Devis,
  quotesOrSources?: Record<string, ShippingQuote> | string | null | DevisPrecedenceSources,
  sousTotalArg?: number,
  sourcesArg?: string | null | DevisPrecedenceSources
): DevisHolder {
  let cities: DeliveryCityOption[]
  let quotes: Record<string, ShippingQuote>
  let sousTotal: number
  let threshold: number = DEFAULT_FREE_SHIPPING_THRESHOLD
  let anyFreeShippingItem: boolean = false
  let sources: string | null | DevisPrecedenceSources | undefined

  if (Array.isArray(citiesOrInitOrDevis)) {
    cities = citiesOrInitOrDevis
    quotes = (quotesOrSources as Record<string, ShippingQuote>) ?? {}
    sousTotal = typeof sousTotalArg === "number" ? sousTotalArg : 0
    sources = sourcesArg
  } else {
    cities = citiesOrInitOrDevis.cities
    sousTotal = citiesOrInitOrDevis.sousTotal
    if ("threshold" in citiesOrInitOrDevis && typeof citiesOrInitOrDevis.threshold === "number") {
      threshold = citiesOrInitOrDevis.threshold
    }
    if ("anyFreeShippingItem" in citiesOrInitOrDevis && typeof (citiesOrInitOrDevis as DevisHolderInit).anyFreeShippingItem === "boolean") {
      anyFreeShippingItem = Boolean((citiesOrInitOrDevis as DevisHolderInit).anyFreeShippingItem)
    }
    quotes =
      citiesOrInitOrDevis.quotes ??
      computeCityQuotes(cities, { subtotal: sousTotal, anyFreeShippingItem }, threshold)

    if (quotesOrSources !== undefined) {
      sources = quotesOrSources as string | null | DevisPrecedenceSources
    } else if ("sources" in citiesOrInitOrDevis && citiesOrInitOrDevis.sources) {
      sources = citiesOrInitOrDevis.sources
    } else if (
      ("urlVilleId" in citiesOrInitOrDevis && citiesOrInitOrDevis.urlVilleId !== undefined) ||
      ("profileVilleId" in citiesOrInitOrDevis && citiesOrInitOrDevis.profileVilleId !== undefined)
    ) {
      sources = {
        urlVilleId: (citiesOrInitOrDevis as DevisHolderInit).urlVilleId,
        profileVilleId: (citiesOrInitOrDevis as DevisHolderInit).profileVilleId,
      }
    } else if ("requestedCityId" in citiesOrInitOrDevis && (citiesOrInitOrDevis as DevisHolderInit).requestedCityId) {
      sources = (citiesOrInitOrDevis as DevisHolderInit).requestedCityId
    } else if ("cas" in citiesOrInitOrDevis && (citiesOrInitOrDevis as Devis).cas === "validée") {
      sources = (citiesOrInitOrDevis as Devis & { cas: "validée" }).ville.id
    }
  }

  function resoudrePrecedence(
    src?: string | null | DevisPrecedenceSources
  ): string | null {
    if (!src) return null
    if (typeof src === "string") {
      const trimmed = src.trim()
      return trimmed.length > 0 ? trimmed : null
    }
    const url = src.urlVilleId?.trim()
    if (url && url.length > 0) return url
    const profil = src.profileVilleId?.trim()
    if (profil && profil.length > 0) return profil
    return null
  }

  function creerInstance(
    villeChoisie: string | null,
    currentQuotes = quotes,
    currentSousTotal = sousTotal,
    currentAnyFree = anyFreeShippingItem
  ): DevisHolder {
    const selection = selectionnerDevis(cities, currentQuotes, villeChoisie)
    const rows = lignesDevis(currentSousTotal, selection)
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
        return creerInstance(trimmed, currentQuotes, currentSousTotal, currentAnyFree)
      },
      recalculer(nouveauSousTotalOuInput) {
        const nextSousTotal =
          typeof nouveauSousTotalOuInput === "number"
            ? nouveauSousTotalOuInput
            : nouveauSousTotalOuInput.sousTotal
        const nextAnyFree =
          typeof nouveauSousTotalOuInput === "object" &&
          nouveauSousTotalOuInput.anyFreeShippingItem !== undefined
            ? Boolean(nouveauSousTotalOuInput.anyFreeShippingItem)
            : currentAnyFree
        const nextQuotes = computeCityQuotes(
          cities,
          { subtotal: nextSousTotal, anyFreeShippingItem: nextAnyFree },
          threshold
        )
        return creerInstance(villeChoisie, nextQuotes, nextSousTotal, nextAnyFree)
      },
      selectionValidee() {
        if (selection.cas !== "validée") {
          throw new DeliveryCityNotFoundError()
        }
        return selection
      },
    }
  }

  const initialCityId = resoudrePrecedence(sources)
  return creerInstance(initialCityId)
}

