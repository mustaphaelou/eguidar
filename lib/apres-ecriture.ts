/**
 * L'Après-écriture : une seule déclaration par genre d'écriture (ADR-0049).
 *
 * Module pur : pas de Prisma, pas de transaction, pas de lecture. Chaque entrée
 * du registre est une fonction pure d'un objet de faits typés vers un plan.
 */

import type { TypeEffetPostCommit } from "@/lib/use-cases/mutation-squelette"
import type { EntiteEffetPostCommit } from "@/lib/use-cases/mutation-squelette"
import type { ActionAutomation } from "@/lib/automations/vocabulaire"
import type {
  TypeEntiteAutomation,
  TypeEvenementAutomation,
} from "@/lib/automations/evenements"
import type { Charge, OrderEmailSnapshot } from "@/lib/automations/charge"

export type GenreEcriture =
  | "produit.enregistre"
  | "produit.enregistre.lot"
  | "produit.supprime"
  | "produit.supprime.lot"
  | "variante.stock.changee"
  | "structure.creee"
  | "structure.modifiee"
  | "structure.supprimee"
  | "commande.creee"
  | "commande.statut.changee"
  | "ville.creee"
  | "ville.modifiee"
  | "ville.supprimee"
  | "livraison.reglee"
  | "image.texte-alternatif"

export interface FaitApresEcriture<
  D extends TypeEvenementAutomation = TypeEvenementAutomation,
> {
  declencheur: D
  entite: TypeEntiteAutomation
  identifiant: string
  charge: Charge<D>
}

export interface ConsequenceApresEcriture<
  E extends TypeEffetPostCommit = TypeEffetPostCommit,
  P = unknown,
> {
  effet: E
  action?: ActionAutomation
  entite: EntiteEffetPostCommit
  message: string
  portee?: number
  durable: boolean
  reparation?: string
  /** La charge utile typée que l'adaptateur de l'entité reçoit. */
  payload?: P
}

export interface PlanApresEcriture<
  C extends ConsequenceApresEcriture = ConsequenceApresEcriture,
> {
  faits: FaitApresEcriture<TypeEvenementAutomation>[]
  consequences: C[]
}

/**
 * Les Produits qu'une écriture de Commande a drainés ou restockés : un fait
 * d'immédiat que la Charge ne porte pas, et que la purge du Catalogue reçoit
 * dans la charge utile de sa conséquence.
 */
export interface ProduitTouche {
  id: string
  slug: string
  categoryId: string | null
}

export type StatutCommande = Charge<"commande.statut.changee">["statut"]

export type EffetCommande = "email" | "invalidation-cache" | "purge-catalogue"

export interface ChargesCommande {
  email: { snapshot: OrderEmailSnapshot; statut?: StatutCommande }
  "invalidation-cache": { commandeId: string }
  "purge-catalogue": { produits: readonly ProduitTouche[] }
}

export type ConsequenceCommande = {
  [E in EffetCommande]: ConsequenceApresEcriture<E, ChargesCommande[E]> & {
    payload: ChargesCommande[E]
  }
}[EffetCommande]

export type ConsequenceCommandeEmail = Extract<
  ConsequenceCommande,
  { effet: "email" }
>
export type ConsequenceCommandeInvalidation = Extract<
  ConsequenceCommande,
  { effet: "invalidation-cache" }
>
export type ConsequenceCommandePurge = Extract<
  ConsequenceCommande,
  { effet: "purge-catalogue" }
>

export type PlanCommande = PlanApresEcriture<ConsequenceCommande>

/**
 * La seule conséquence de Livraison : invalider le cache. Elle est non durable,
 * réparée par le TTL, et ne porte aucun fait — donc aucun Événement et aucune
 * Exécution d'automatisation.
 */
export type EffetLivraison = "invalidation-cache"

/**
 * La charge utile d'une invalidation de Livraison : l'identifiant de l'objet
 * touché suffit, puisque le port n'a qu'un cache à invalider.
 */
export interface ChargesLivraison {
  "invalidation-cache": { id: string }
}

export type ConsequenceLivraison = {
  [E in EffetLivraison]: ConsequenceApresEcriture<E, ChargesLivraison[E]> & {
    payload: ChargesLivraison[E]
  }
}[EffetLivraison]

export type PlanLivraison = PlanApresEcriture<ConsequenceLivraison>

export type FaitsApresEcriture = Record<string, unknown>

type OptionsConsequence<P> = {
  action?: ActionAutomation
  portee?: number
  durable: boolean
  reparation?: string
  payload?: P
}

function fait<D extends TypeEvenementAutomation>(
  declencheur: D,
  entite: TypeEntiteAutomation,
  identifiant: string,
  charge: Charge<D>
): FaitApresEcriture<D> {
  return { declencheur, entite, identifiant, charge }
}

function consequence<E extends TypeEffetPostCommit, P>(
  effet: E,
  entite: EntiteEffetPostCommit,
  message: string,
  options: OptionsConsequence<P> & { payload: P }
): ConsequenceApresEcriture<E, P> & { payload: P }
function consequence<E extends TypeEffetPostCommit>(
  effet: E,
  entite: EntiteEffetPostCommit,
  message: string,
  options: OptionsConsequence<unknown>
): ConsequenceApresEcriture<E>
function consequence(
  effet: TypeEffetPostCommit,
  entite: EntiteEffetPostCommit,
  message: string,
  options: OptionsConsequence<unknown>
): ConsequenceApresEcriture {
  return { effet, entite, message, ...options }
}

/**
 * Le pseudo-identifiant de journal d'une conséquence groupée : la portée porte
 * le nombre réel de Produits, l'identifiant ne désigne aucune entité.
 */
export const IDENTIFIANT_LOT = "lot"

// Commande
const commandeCreee: DeclarationPour<"commande.creee"> = (f) => {
  const commandeId = String(f.commandeId)
  return {
    faits: [
      fait("commande.creee", "commande", commandeId, {
        snapshot: f.snapshot,
      }),
    ],
    consequences: [
      consequence(
        "email",
        { type: "commande", id: commandeId },
        f.messageEmail ??
          `[order] e-mail de confirmation non envoyé pour ${commandeId}`,
        {
          action: "email.commande-creee",
          durable: true,
          payload: { snapshot: f.snapshot },
        }
      ),
      consequence(
        "invalidation-cache",
        { type: "commande", id: commandeId },
        f.messageInvalidation ??
          `[order] invalidation du cache non effectuée pour ${commandeId}`,
        {
          durable: false,
          reparation: "TTL",
          payload: { commandeId },
        }
      ),
      consequence(
        "purge-catalogue",
        { type: "commande", id: commandeId },
        f.messagePurge ??
          `[order] purge des documents du catalogue non effectuée pour ${commandeId}`,
        {
          durable: false,
          reparation: "TTL",
          payload: { produits: f.produitsDrainés ?? [] },
        }
      ),
    ],
  }
}

const commandeStatutChangee: DeclarationPour<"commande.statut.changee"> = (
  f
) => {
  const commandeId = String(f.commandeId)
  return {
    faits: [
      fait("commande.statut.changee", "commande", commandeId, {
        snapshot: f.snapshot,
        statut: f.statut,
      }),
    ],
    consequences: [
      consequence(
        "email",
        { type: "commande", id: commandeId },
        f.messageEmail ??
          `[order] e-mail de statut non envoyé pour ${commandeId}`,
        {
          action: "email.commande-statut",
          durable: true,
          payload: { snapshot: f.snapshot, statut: f.statut },
        }
      ),
      consequence(
        "invalidation-cache",
        { type: "commande", id: commandeId },
        f.messageInvalidation ??
          `[order] invalidation du cache non effectuée pour ${commandeId}`,
        {
          durable: false,
          reparation: "TTL",
          payload: { commandeId },
        }
      ),
      consequence(
        "purge-catalogue",
        { type: "commande", id: commandeId },
        f.messagePurge ??
          `[order] purge des documents du catalogue non effectuée pour ${commandeId}`,
        {
          durable: false,
          reparation: "TTL",
          payload: { produits: f.produitsRestockés ?? [] },
        }
      ),
    ],
  }
}

// Produit enregistre
const produitEnregistre: DeclarationPour<"produit.enregistre"> = (f) => {
  const consequences: ConsequenceApresEcriture[] = [
    consequence(
      "registre-images",
      { type: "produit", id: String(f.produitId) },
      `registre des images produit pour ${f.produitId}`,
      {
        durable: false,
        reparation: "réconciliation par la Bibliothèque des médias",
      }
    ),
    consequence(
      "suppression-brouillons",
      { type: "produit", id: String(f.produitId) },
      `suppression des brouillons pour ${f.produitId}`,
      { durable: false, reparation: "cycle de vie R2" }
    ),
  ]
  const removed = (f.imagesRetirees as string[] | undefined) ?? []
  if (removed.length > 0) {
    consequences.push(
      consequence(
        "suppression-images",
        { type: "produit", id: String(f.produitId) },
        `suppression des images pour ${f.produitId}`,
        { action: "suppression.images", durable: true }
      )
    )
  }
  consequences.push(
    consequence(
      "reindexation",
      { type: "produit", id: String(f.produitId) },
      `réindexation du produit ${f.produitId}`,
      { action: "index.produit", durable: true }
    ),
    consequence(
      "invalidation-cache",
      { type: "produit", id: String(f.produitId) },
      `invalidation du catalogue pour ${f.produitId}`,
      { action: "invalidation.catalogue", durable: true }
    ),
    consequence(
      "purge-catalogue",
      { type: "produit", id: String(f.produitId) },
      `purge du bord pour ${f.produitId}`,
      { action: "purge.catalogue", durable: true }
    )
  )
  return {
    faits: [
      fait("produit.enregistre", "produit", String(f.produitId), {
        produitId: f.produitId as never,
        slug: (f.slug ?? "") as never,
        slugPrecedent: (f.slugPrecedent ?? null) as never,
        categoryId: (f.categoryId ?? null) as never,
        categoryIdPrecedent: (f.categoryIdPrecedent ?? null) as never,
        imagesRetirees: removed as never,
      }),
    ],
    consequences,
  }
}

const produitEnregistreLot: DeclarationPour<"produit.enregistre.lot"> = (f) => {
  const produitsInput = (f.produits as Array<Record<string, unknown>>) ?? []
  const ids =
    (f.produitIds as string[]) ??
    produitsInput.map((p) => String(p.id ?? p.produitId))
  const produits = ids.map((id, index) => {
    const p = produitsInput[index] ?? {}
    return {
      id,
      slug: p.slug ?? null,
      slugPrecedent: p.slugPrecedent ?? null,
      categoryId: p.categoryId ?? null,
      categoryIdPrecedent: p.categoryIdPrecedent ?? null,
      imagesRetirees: (p.imagesRetirees as string[]) ?? [],
    }
  })
  const consequences: ConsequenceApresEcriture[] = [
    consequence(
      "reindexation",
      { type: "produit", id: IDENTIFIANT_LOT },
      `réindexation groupée`,
      { action: "index.produit", durable: true, portee: ids.length }
    ),
  ]
  for (const id of ids) {
    consequences.push(
      consequence(
        "invalidation-cache",
        { type: "produit", id },
        `invalidation du catalogue pour ${id}`,
        { action: "invalidation.catalogue", durable: true }
      )
    )
  }
  return {
    faits: produits.map((p) =>
      fait("produit.enregistre", "produit", p.id, {
        produitId: p.id as never,
        slug: (p.slug ?? "") as never,
        slugPrecedent: (p.slugPrecedent ?? null) as never,
        categoryId: (p.categoryId ?? null) as never,
        categoryIdPrecedent: (p.categoryIdPrecedent ?? null) as never,
        imagesRetirees: (p.imagesRetirees ?? []) as never,
      })
    ),
    consequences,
  }
}

const produitSupprime: DeclarationPour<"produit.supprime"> = (f) => {
  const urls =
    (f.imagesRetirees as string[] | undefined) ??
    (f.images as string[] | undefined) ??
    []
  return {
    faits: [
      fait("produit.supprime", "produit", String(f.produitId), {
        produitId: f.produitId as never,
        slug: (f.slug ?? "") as never,
        categoryId: (f.categoryId ?? null) as never,
        imagesRetirees: urls as never,
      }),
    ],
    consequences: [
      consequence(
        "suppression-images",
        { type: "produit", id: String(f.produitId) },
        `suppression des images pour ${f.produitId}`,
        { action: "suppression.images", durable: true }
      ),
      consequence(
        "desindexation",
        { type: "produit", id: String(f.produitId) },
        `désindexation du produit ${f.produitId}`,
        { action: "desindex.produit", durable: true }
      ),
      consequence(
        "invalidation-cache",
        { type: "produit", id: String(f.produitId) },
        `invalidation du catalogue après suppression ${f.produitId}`,
        { action: "invalidation.catalogue", durable: true }
      ),
      consequence(
        "purge-catalogue",
        { type: "produit", id: String(f.produitId) },
        `purge du bord après suppression ${f.produitId}`,
        { action: "purge.catalogue", durable: true }
      ),
    ],
  }
}

const produitSupprimeLot: DeclarationPour<"produit.supprime.lot"> = (f) => {
  const produitsInput = (f.produits as Array<Record<string, unknown>>) ?? []
  const ids =
    (f.produitIds as string[]) ??
    produitsInput.map((produit) => String(produit.id ?? produit.produitId))
  const produits = ids.map((id, index) => {
    const produit = produitsInput[index] ?? {}
    return {
      id,
      slug: produit.slug ?? null,
      categoryId: produit.categoryId ?? null,
      images: (produit.images as string[]) ?? [],
    }
  })
  const portee = ids.length
  return {
    faits: produits.map((produit) =>
      fait("produit.supprime", "produit", produit.id, {
        produitId: produit.id as never,
        slug: (produit.slug ?? "") as never,
        categoryId: (produit.categoryId ?? null) as never,
        imagesRetirees: (produit.images ?? []) as never,
      })
    ),
    consequences: [
      consequence(
        "suppression-images",
        { type: "produit", id: IDENTIFIANT_LOT },
        `suppression des images groupée`,
        { action: "suppression.images", durable: true, portee }
      ),
      consequence(
        "desindexation",
        { type: "produit", id: IDENTIFIANT_LOT },
        `désindexation groupée`,
        { action: "desindex.produit", durable: true, portee }
      ),
      consequence(
        "invalidation-cache",
        { type: "produit", id: IDENTIFIANT_LOT },
        `invalidation du catalogue groupée après suppression`,
        { action: "invalidation.catalogue", durable: true, portee }
      ),
      consequence(
        "purge-catalogue",
        { type: "produit", id: IDENTIFIANT_LOT },
        `purge du bord groupée après suppression`,
        { action: "purge.catalogue", durable: true, portee }
      ),
    ],
  }
}

const varianteStockChangee: DeclarationPour<"variante.stock.changee"> = (
  f
) => ({
  faits: [
    fait("variante.stock.changee", "produit", String(f.produitId), {
      produitId: f.produitId as never,
    }),
  ],
  consequences: [
    consequence(
      "reindexation",
      { type: "produit", id: String(f.produitId) },
      `réindexation du produit ${f.produitId}`,
      { action: "index.produit", durable: true }
    ),
    consequence(
      "invalidation-cache",
      { type: "produit", id: String(f.produitId) },
      `invalidation du cache pour ${f.produitId}`,
      { durable: false, reparation: "TTL" }
    ),
  ],
})

const structureCreee: DeclarationPour<"structure.creee"> = (f) => ({
  faits: [
    fait("structure.creee", "categorie", String(f.categorieId), {
      categorieId: f.categorieId as never,
    }),
  ],
  consequences: [
    consequence(
      "invalidation-cache",
      { type: "categorie", id: String(f.categorieId) },
      `invalidation de la structure ${f.categorieId}`,
      { action: "invalidation.structure", durable: true }
    ),
  ],
})

const structureModifiee: DeclarationPour<"structure.modifiee"> = (f) => {
  const consequences: ConsequenceApresEcriture[] = []
  if (f.imageRetiree) {
    consequences.push(
      consequence(
        "suppression-images",
        { type: "categorie", id: String(f.categorieId) },
        `suppression de l'image de la structure ${f.categorieId}`,
        { action: "suppression.images", durable: true }
      )
    )
  }
  consequences.push(
    consequence(
      "reindexation",
      { type: "categorie", id: String(f.categorieId) },
      `réindexation de la structure ${f.categorieId}`,
      { action: "index.structure", durable: true }
    ),
    consequence(
      "invalidation-cache",
      { type: "categorie", id: String(f.categorieId) },
      `invalidation de la structure ${f.categorieId}`,
      { action: "invalidation.structure", durable: true }
    )
  )
  const imagesRetireesModifiee = Array.isArray(f.imagesRetirees)
    ? (f.imagesRetirees as string[])
    : f.imageRetiree
      ? [String(f.imageRetiree)]
      : f.image
        ? [String(f.image)]
        : []
  const destinationsModifiee = Array.isArray(f.destinations)
    ? (f.destinations as string[])
    : f.destination
      ? [String(f.destination)]
      : []
  return {
    faits: [
      fait("structure.modifiee", "categorie", String(f.categorieId), {
        categorieId: f.categorieId as never,
        imagesRetirees: imagesRetireesModifiee as never,
        destinations: destinationsModifiee as never,
      }),
    ],
    consequences,
  }
}

/**
 * La branche orpheline n'a pas d'identifiant en base : c'est un
 * pseudo-identifiant de journal que l'adaptateur immédiat traduit en
 * `categoryId: null`, et que l'action durable reconnaît à l'absence de
 * destination. Le fait ne porte jamais la branche elle-même, seulement les
 * identifiants de destination.
 */
export const BRANCHE_SANS_STRUCTURE = "sans-structure"

function destinationsDeSuppression(
  produitsCible: unknown,
  enfantsCible: unknown
): string[] {
  return [
    ...new Set(
      [produitsCible, enfantsCible].filter(
        (destination): destination is string =>
          typeof destination === "string" && destination.length > 0
      )
    ),
  ]
}

const structureSupprimee: DeclarationPour<"structure.supprimee"> = (f) => {
  const image = typeof f.image === "string" && f.image !== "" ? f.image : null
  const destinations = destinationsDeSuppression(
    f.produitsCible,
    f.enfantsCible
  )
  const consequences: ConsequenceApresEcriture[] = []
  for (const destination of destinations) {
    consequences.push(
      consequence(
        "reindexation",
        { type: "categorie", id: destination },
        `réindexation de la structure ${destination}`,
        { action: "index.structure", durable: true }
      )
    )
  }
  if (f.produitsSansStructure === true) {
    consequences.push(
      consequence(
        "reindexation",
        { type: "categorie", id: BRANCHE_SANS_STRUCTURE },
        `réindexation des Produits orphelins`,
        { action: "index.structure", durable: true }
      )
    )
  }
  if (image) {
    consequences.push(
      consequence(
        "suppression-images",
        { type: "categorie", id: String(f.categorieId) },
        `suppression de l'image de la structure ${f.categorieId}`,
        { action: "suppression.images", durable: true }
      )
    )
  }
  consequences.push(
    consequence(
      "invalidation-cache",
      { type: "categorie", id: String(f.categorieId) },
      `invalidation de la structure ${f.categorieId}`,
      { action: "invalidation.structure", durable: true }
    )
  )
  const imagesRetireesSupprimee = Array.isArray(f.imagesRetirees)
    ? (f.imagesRetirees as string[])
    : image
      ? [image]
      : []
  const destinationsSupprimee = [
    ...destinations,
    ...(f.produitsSansStructure === true ? ["sans-structure"] : []),
  ]
  return {
    faits: [
      fait("structure.supprimee", "categorie", String(f.categorieId), {
        categorieId: f.categorieId as never,
        imagesRetirees: imagesRetireesSupprimee as never,
        destinations: destinationsSupprimee as never,
      }),
    ],
    consequences,
  }
}

/**
 * Une conséquence de maintenance : aucune conséquence durable, donc aucun
 * Événement, et sa seule conséquence est la tentative immédiate d'invalidation
 * du cache. Un échec est journalisé et le TTL du cache le répare.
 */
function consequenceDeMaintenance(
  entite: EntiteEffetPostCommit,
  message: string
): ConsequenceApresEcriture {
  return consequence("invalidation-cache", entite, message, {
    durable: false,
    reparation: "TTL",
  })
}

/**
 * L'unique conséquence des écritures de Livraison : l'invalidation du cache,
 * non durable et réparée par le TTL, sans fait ni Événement. La charge utile
 * typée ne porte que l'identifiant de l'objet touché — le port n'a qu'un cache
 * à invalider.
 */
function consequenceDeLivraison(
  entite: EntiteEffetPostCommit,
  message: string,
  id: string
): ConsequenceLivraison {
  return consequence("invalidation-cache", entite, message, {
    durable: false,
    reparation: "TTL",
    payload: { id },
  })
}

function planDeLivraison(
  entite: EntiteEffetPostCommit,
  message: string,
  id: string
): PlanLivraison {
  return {
    faits: [],
    consequences: [consequenceDeLivraison(entite, message, id)],
  }
}

const villeCreee: DeclarationPour<"ville.creee"> = (f) => {
  const villeId = String(f.villeId)
  return planDeLivraison(
    { type: "ville", id: villeId },
    `invalidation du cache livraison pour la création de la ville ${villeId}`,
    villeId
  )
}

const villeModifiee: DeclarationPour<"ville.modifiee"> = (f) => {
  const villeId = String(f.villeId)
  return planDeLivraison(
    { type: "ville", id: villeId },
    `invalidation du cache livraison pour la ville ${villeId}`,
    villeId
  )
}

const villeSupprimee: DeclarationPour<"ville.supprimee"> = (f) => {
  const villeId = String(f.villeId)
  return planDeLivraison(
    { type: "ville", id: villeId },
    `invalidation du cache livraison pour la suppression de la ville ${villeId}`,
    villeId
  )
}

const livraisonReglee: DeclarationPour<"livraison.reglee"> = (f) => {
  const livraisonId = String(f.livraisonId ?? "default")
  return planDeLivraison(
    { type: "livraison", id: livraisonId },
    "invalidation du cache livraison pour le seuil de livraison",
    livraisonId
  )
}

/**
 * Une Image produit n'a qu'un propriétaire, mais l'écriture reste une liste :
 * chaque Produit touché reçoit sa propre conséquence, donc sa propre ligne de
 * journal et sa propre limite d'échec.
 */
const imageTexteAlternatif: DeclarationPour<"image.texte-alternatif"> = (f) => {
  const produitIds = ((f.produitIds as string[] | undefined) ?? []).map(String)
  return {
    faits: [],
    consequences: produitIds.map((produitId) =>
      consequenceDeMaintenance(
        { type: "produit", id: produitId },
        `invalidation du cache catalogue pour le Produit ${produitId} après modification du Texte alternatif`
      )
    ),
  }
}

/**
 * Les plans que les tranches ont déjà typés. Un genre absent rend le plan
 * générique : la tranche suivante l'ajoute ici sans toucher au registre.
 */
export type PlansTypés = {
  "commande.creee": PlanCommande
  "commande.statut.changee": PlanCommande
  "ville.creee": PlanLivraison
  "ville.modifiee": PlanLivraison
  "ville.supprimee": PlanLivraison
  "livraison.reglee": PlanLivraison
}

export type PlanParGenre = {
  [G in GenreEcriture]: G extends keyof PlansTypés
    ? PlansTypés[G]
    : PlanApresEcriture
}

type DeclarationPour<G extends GenreEcriture> = (
  faits: FaitsParGenre[G]
) => PlanParGenre[G]

const REGISTRE: { [G in GenreEcriture]: DeclarationPour<G> } = {
  "commande.creee": commandeCreee,
  "commande.statut.changee": commandeStatutChangee,
  "produit.enregistre": produitEnregistre,
  "produit.enregistre.lot": produitEnregistreLot,
  "produit.supprime": produitSupprime,
  "produit.supprime.lot": produitSupprimeLot,
  "variante.stock.changee": varianteStockChangee,
  "structure.creee": structureCreee,
  "structure.modifiee": structureModifiee,
  "structure.supprimee": structureSupprimee,
  "ville.creee": villeCreee,
  "ville.modifiee": villeModifiee,
  "ville.supprimee": villeSupprimee,
  "livraison.reglee": livraisonReglee,
  "image.texte-alternatif": imageTexteAlternatif,
}

export type FaitsCommandeCreee = {
  commandeId: string | number
  snapshot: OrderEmailSnapshot
  produitsDrainés?: readonly ProduitTouche[]
  messageEmail?: string
  messageInvalidation?: string
  messagePurge?: string
}

export type FaitsCommandeStatutChangee = {
  commandeId: string | number
  snapshot: OrderEmailSnapshot
  statut: StatutCommande
  produitsRestockés?: readonly ProduitTouche[]
  messageEmail?: string
  messageInvalidation?: string
  messagePurge?: string
}

export type FaitsProduitEnregistre = {
  produitId: string | number
  slug: unknown
  slugPrecedent?: unknown
  categoryId?: unknown
  categoryIdPrecedent?: unknown
  imagesRetirees?: unknown
  galerie?: unknown
}

export type FaitsProduitEnregistreLot = {
  produitIds?: readonly (string | number)[]
  produits?: readonly Record<string, unknown>[]
}

export type FaitsProduitSupprime = {
  produitId: string | number
  slug?: unknown
  categoryId?: unknown
  images?: unknown
  imagesRetirees?: unknown
}

export type FaitsProduitSupprimeLot = {
  produitIds?: readonly (string | number)[]
  produits?: readonly Record<string, unknown>[]
}

export type FaitsVarianteStockChangee = {
  produitId: string | number
}

export type FaitsStructureCreee = {
  categorieId: string | number
}

export type FaitsStructureModifiee = {
  categorieId: string | number
  imageRetiree?: unknown
  image?: unknown
  imagesRetirees?: unknown
  destination?: unknown
  destinations?: unknown
}

export type FaitsStructureSupprimee = {
  categorieId: string | number
  image?: unknown
  images?: unknown
  imagesRetirees?: unknown
  produitsCible?: unknown
  enfantsCible?: unknown
  destinations?: unknown
  produitsSansStructure?: unknown
}

export type FaitsVilleCreee = { villeId: string | number }
export type FaitsVilleModifiee = { villeId: string | number }
export type FaitsVilleSupprimee = { villeId: string | number }
export type FaitsLivraisonReglee = { livraisonId?: string | number }
export type FaitsImageTexteAlternatif = {
  produitIds?: readonly (string | number)[]
}

export type FaitsParGenre = {
  "commande.creee": FaitsCommandeCreee
  "commande.statut.changee": FaitsCommandeStatutChangee
  "produit.enregistre": FaitsProduitEnregistre
  "produit.enregistre.lot": FaitsProduitEnregistreLot
  "produit.supprime": FaitsProduitSupprime
  "produit.supprime.lot": FaitsProduitSupprimeLot
  "variante.stock.changee": FaitsVarianteStockChangee
  "structure.creee": FaitsStructureCreee
  "structure.modifiee": FaitsStructureModifiee
  "structure.supprimee": FaitsStructureSupprimee
  "ville.creee": FaitsVilleCreee
  "ville.modifiee": FaitsVilleModifiee
  "ville.supprimee": FaitsVilleSupprimee
  "livraison.reglee": FaitsLivraisonReglee
  "image.texte-alternatif": FaitsImageTexteAlternatif
}

export function declarerApresEcriture<G extends GenreEcriture>(
  genre: G,
  faits?: FaitsParGenre[G]
): PlanParGenre[G] {
  return (REGISTRE[genre] as DeclarationPour<G>)(
    (faits ?? {}) as FaitsParGenre[G]
  )
}

/**
 * Les genres dont la déclaration possède les Règles par défaut : tous les
 * genres unitaires. Les genres groupés sont exclus parce qu'ils partagent le
 * déclencheur du genre unitaire, et les écritures de maintenance n'ajoutent
 * aucune Règle puisqu'elles n'ont aucune conséquence durable. Un genre qui
 * déclarerait une conséquence durable entre donc ici sans autre édition.
 */
export const GENRES_DERIVES: GenreEcriture[] = (
  Object.keys(REGISTRE) as GenreEcriture[]
).filter((genre) => !genre.endsWith(".lot"))

// Identités historiques des Règles par défaut dérivées, pour conserver
// l'historique d'Exécution.
const IDENTITES_REGLES_MIGREES: Record<string, { id: string; nom: string }> = {
  "email.commande-creee": {
    id: "confirmation-commande",
    nom: "Confirmation de Commande",
  },
  "email.commande-statut": {
    id: "statut-commande",
    nom: "E-mail de statut de Commande",
  },
  "index.produit": { id: "indexation-produit", nom: "Indexation du Produit" },
  "invalidation.catalogue": {
    id: "invalidation-catalogue",
    nom: "Invalidation du Catalogue",
  },
  "purge.catalogue": { id: "purge-catalogue", nom: "Purge du bord" },
  // Une même action peut servir deux déclencheurs : la clé qualifiée garde une
  // identité de Règle distincte par déclencheur, comme le semis créateur
  // seulement l'exige.
  "produit.enregistre|suppression.images": {
    id: "suppression-images-produit-enregistre",
    nom: "Suppression des images retirées",
  },
  "produit.supprime|suppression.images": {
    id: "suppression-images-produit",
    nom: "Suppression des images",
  },
  "produit.supprime|desindex.produit": {
    id: "desindexation-produit",
    nom: "Désindexation du Produit",
  },
  "produit.supprime|invalidation.catalogue": {
    id: "invalidation-catalogue-suppression",
    nom: "Invalidation après suppression",
  },
  "produit.supprime|purge.catalogue": {
    id: "purge-catalogue-suppression",
    nom: "Purge après suppression",
  },
  "variante.stock.changee|index.produit": {
    id: "indexation-stock",
    nom: "Indexation du stock",
  },
  "structure.creee|invalidation.structure": {
    id: "invalidation-structure",
    nom: "Invalidation de la Structure",
  },
  "structure.modifiee|invalidation.structure": {
    id: "invalidation-structure-modifiee",
    nom: "Invalidation de la Structure modifiée",
  },
  "structure.modifiee|index.structure": {
    id: "indexation-structure",
    nom: "Indexation de la Structure",
  },
  "structure.modifiee|suppression.images": {
    id: "suppression-images-structure-modifiee",
    nom: "Suppression des images",
  },
  "structure.supprimee|index.structure": {
    id: "indexation-structure-supprimee",
    nom: "Indexation de la Structure supprimée",
  },
  "structure.supprimee|suppression.images": {
    id: "suppression-images-structure-supprimee",
    nom: "Suppression de l'image de la Structure supprimée",
  },
  "structure.supprimee|invalidation.structure": {
    id: "invalidation-structure-supprimee",
    nom: "Invalidation de la Structure supprimée",
  },
}

export class IdentiteRegleInconnueError extends Error {
  constructor(
    readonly declencheur: TypeEvenementAutomation,
    readonly action: ActionAutomation
  ) {
    super(
      `Aucune identité de Règle par défaut pour « ${action} » déclenchée par « ${declencheur} »`
    )
    this.name = "IdentiteRegleInconnueError"
  }
}

/**
 * L'identité stable d'une Règle par défaut : la clé qualifiée par déclencheur
 * quand une même action sert deux genres, sinon l'identité historique de
 * l'action. Un couple inconnu lève — une conséquence durable sans Règle est une
 * erreur de semis, jamais un silence.
 */
export function identiteDeRegle(
  declencheur: TypeEvenementAutomation,
  action: ActionAutomation
): { id: string; nom: string } {
  const identite =
    IDENTITES_REGLES_MIGREES[`${declencheur}|${action}`] ??
    IDENTITES_REGLES_MIGREES[action]
  if (!identite) throw new IdentiteRegleInconnueError(declencheur, action)
  return identite
}

/**
 * Les faits qui révèlent les conséquences conditionnelles d'un genre : une
 * conséquence déclarée seulement quand une image est retirée n'apparaît pas
 * dans un plan appelé sans faits, mais sa Règle par défaut doit exister. Ce
 * modèle ne remplace jamais les faits d'une écriture réelle ; il ne sert qu'au
 * semis.
 */
export const FAITS_POUR_REGLES: Partial<
  Record<GenreEcriture, FaitsApresEcriture>
> = {
  "produit.enregistre": {
    produitId: "produit-modele",
    imagesRetirees: ["https://cdn.example.test/modele.jpg"],
  },
  "structure.modifiee": {
    categorieId: "categorie-modele",
    imageRetiree: "https://cdn.example.test/modele.jpg",
  },
  "structure.supprimee": {
    categorieId: "categorie-modele",
    image: "https://cdn.example.test/modele.jpg",
    produitsCible: "categorie-modele-cible",
  },
}

/**
 * Les déclencheurs planifiés ne viennent pas d'une écriture d'Administration :
 * la déclaration nomme donc leurs Règles directement, à côté des Règles
 * dérivées des plans, pour qu'une seule source possède la politique par
 * défaut.
 */
const REGLES_PLANIFIEES: Array<{
  id: string
  nom: string
  declencheur: TypeEvenementAutomation
  action: ActionAutomation
  actif?: boolean
}> = [
  {
    id: "digest-stock-bas",
    nom: "Digest du stock bas",
    declencheur: "planification.digest-stock-bas",
    action: "digest.stock-bas",
  },
  {
    id: "reconciliation-recherche",
    nom: "Réconciliation de la recherche",
    declencheur: "planification.reconciliation-recherche",
    action: "reconciliation.recherche",
  },
  {
    id: "digest-proprietaire",
    nom: "Digest du propriétaire",
    declencheur: "planification.digest-stock-bas",
    action: "digest.proprietaire",
    actif: false,
  },
]

// Règles par défaut : chaque Règle durable vient de la déclaration du genre
// qui l'émet ; seuls les déclencheurs planifiés sont nommés directement.
export function reglesParDefaut(): Array<{
  id: string
  nom: string
  declencheur: TypeEvenementAutomation
  action: ActionAutomation
  condition: { type: "toujours" }
  actif: boolean
}> {
  const out: Array<{
    id: string
    nom: string
    declencheur: TypeEvenementAutomation
    action: ActionAutomation
    condition: { type: "toujours" }
    actif: boolean
  }> = []
  // Un même déclencheur peut déclarer plusieurs conséquences qui demandent la
  // même action — une réindexation par branche de destination d'une Structure
  // supprimée, par exemple. La Règle par défaut est gouvernée par l'action, pas
  // par le nombre de branches : une seule ligne suffit, et l'action lit toutes
  // les destinations de la charge.
  const reglesVues = new Set<string>()
  for (const genre of GENRES_DERIVES) {
    const plan = declarerApresEcriture(
      genre,
      (FAITS_POUR_REGLES[genre] ?? {}) as FaitsParGenre[typeof genre]
    )
    const declencheur = (plan.faits[0]?.declencheur ??
      genre) as TypeEvenementAutomation
    for (const c of plan.consequences) {
      if (!c.durable || !c.action) continue
      const identite = identiteDeRegle(declencheur, c.action)
      if (reglesVues.has(identite.id)) continue
      reglesVues.add(identite.id)
      out.push({
        id: identite.id,
        nom: identite.nom,
        declencheur,
        action: c.action,
        condition: { type: "toujours" },
        actif: true,
      })
    }
  }
  for (const r of REGLES_PLANIFIEES) {
    out.push({ ...r, condition: { type: "toujours" }, actif: r.actif ?? true })
  }
  return out
}
