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
import type { PreuvePromotion } from "@/lib/cycle-vie-image-produit"
import type { EntreeRegistreImageProduit } from "@/lib/use-cases/images-produit"

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

export type EffetStructure =
  "suppression-images" | "reindexation" | "invalidation-cache"

export interface ChargesStructure {
  /** Les URL des images retirées de la Structure. */
  "suppression-images": { urls: readonly string[] }
  /**
   * La branche à réindexer : un identifiant de Structure, ou le
   * pseudo-identifiant `BRANCHE_SANS_STRUCTURE` pour les Produits orphelins.
   */
  reindexation: { branche: string }
  "invalidation-cache": { categorieId: string }
}

export type ConsequenceStructure = {
  [E in EffetStructure]: ConsequenceApresEcriture<E, ChargesStructure[E]> & {
    payload: ChargesStructure[E]
  }
}[EffetStructure]

export type ConsequenceStructureSuppressionImages = Extract<
  ConsequenceStructure,
  { effet: "suppression-images" }
>
export type ConsequenceStructureReindexation = Extract<
  ConsequenceStructure,
  { effet: "reindexation" }
>
export type ConsequenceStructureInvalidation = Extract<
  ConsequenceStructure,
  { effet: "invalidation-cache" }
>

export type PlanStructure = PlanApresEcriture<ConsequenceStructure>

/**
 * L'identité d'un Produit qu'une conséquence Catalogue transporte. Les
 * documents indexables et les événements Catalogue sont des lectures après
 * commit : la déclaration ne les connaît pas, l'adaptateur les résout par
 * `lectures`.
 */
export interface IdentiteProduitCatalogue {
  id: string
  slug: string
  slugPrecedent?: string | null
  categoryId?: string | null
  categoryIdPrecedent?: string | null
}

export type EffetCatalogue =
  | "registre-images"
  | "suppression-brouillons"
  | "suppression-images"
  | "reindexation"
  | "desindexation"
  | "invalidation-cache"
  | "purge-catalogue"

export interface ChargesCatalogue {
  "registre-images": {
    entrees: readonly EntreeRegistreImageProduit[]
    ownerId: string | null
  }
  "suppression-brouillons": { promotions: readonly PreuvePromotion[] }
  "suppression-images": { urls: readonly string[] }
  reindexation: { produits: readonly IdentiteProduitCatalogue[] }
  desindexation: { produitId: string }
  "invalidation-cache": { produit: IdentiteProduitCatalogue }
  "purge-catalogue": { produit: IdentiteProduitCatalogue }
}

export type ConsequenceCatalogue = {
  [E in EffetCatalogue]: ConsequenceApresEcriture<E, ChargesCatalogue[E]> & {
    payload: ChargesCatalogue[E]
  }
}[EffetCatalogue]

export type ConsequenceCatalogueRegistre = Extract<
  ConsequenceCatalogue,
  { effet: "registre-images" }
>
export type ConsequenceCatalogueBrouillons = Extract<
  ConsequenceCatalogue,
  { effet: "suppression-brouillons" }
>
export type ConsequenceCatalogueImages = Extract<
  ConsequenceCatalogue,
  { effet: "suppression-images" }
>
export type ConsequenceCatalogueReindexation = Extract<
  ConsequenceCatalogue,
  { effet: "reindexation" }
>
export type ConsequenceCatalogueDesindexation = Extract<
  ConsequenceCatalogue,
  { effet: "desindexation" }
>
export type ConsequenceCatalogueInvalidation = Extract<
  ConsequenceCatalogue,
  { effet: "invalidation-cache" }
>
export type ConsequenceCataloguePurge = Extract<
  ConsequenceCatalogue,
  { effet: "purge-catalogue" }
>

export type PlanCatalogue = PlanApresEcriture<ConsequenceCatalogue>

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
  const produitId = String(f.produitId)
  const slug = String(f.slug)
  const slugPrecedent = f.slugPrecedent ?? null
  const categoryId = f.categoryId ?? null
  const categoryIdPrecedent = f.categoryIdPrecedent ?? null
  const imagesRetirees = [...(f.imagesRetirees ?? [])]
  const entreesRegistre = [...(f.entreesRegistre ?? [])]
  const promotions = [...(f.promotions ?? [])]
  const identite: IdentiteProduitCatalogue = {
    id: produitId,
    slug,
    slugPrecedent,
    categoryId,
    categoryIdPrecedent,
  }
  const consequences: ConsequenceCatalogue[] = [
    consequence(
      "registre-images",
      { type: "produit", id: produitId },
      `registre des images produit pour ${produitId}`,
      {
        durable: false,
        reparation: "réconciliation par la Bibliothèque des médias",
        payload: { entrees: entreesRegistre, ownerId: f.ownerId ?? null },
      }
    ),
    consequence(
      "suppression-brouillons",
      { type: "produit", id: produitId },
      `suppression des brouillons pour ${produitId}`,
      {
        durable: false,
        reparation: "cycle de vie R2",
        payload: { promotions },
      }
    ),
  ]
  if (imagesRetirees.length > 0) {
    consequences.push(
      consequence(
        "suppression-images",
        { type: "produit", id: produitId },
        `suppression des images pour ${produitId}`,
        {
          action: "suppression.images",
          durable: true,
          payload: { urls: imagesRetirees },
        }
      )
    )
  }
  consequences.push(
    consequence(
      "reindexation",
      { type: "produit", id: produitId },
      `réindexation du produit ${produitId}`,
      {
        action: "index.produit",
        durable: true,
        payload: { produits: [identite] },
      }
    ),
    consequence(
      "invalidation-cache",
      { type: "produit", id: produitId },
      `invalidation du catalogue pour ${produitId}`,
      {
        action: "invalidation.catalogue",
        durable: true,
        payload: { produit: identite },
      }
    ),
    consequence(
      "purge-catalogue",
      { type: "produit", id: produitId },
      `purge du bord pour ${produitId}`,
      {
        action: "purge.catalogue",
        durable: true,
        payload: { produit: identite },
      }
    )
  )
  return {
    faits: [
      fait("produit.enregistre", "produit", produitId, {
        produitId,
        slug,
        slugPrecedent,
        categoryId,
        categoryIdPrecedent,
        imagesRetirees,
      }),
    ],
    consequences,
  }
}

/**
 * Les Produits d'un lot, alignés sur `produitIds` quand il est fourni et
 * complétés par la liste typée sinon. Un Produit sans fiche garde son
 * identifiant et un slug vide : le fait reste émis, la lecture après commit
 * décidera.
 */
function produitsDuLot(f: {
  produitIds?: readonly string[]
  produits?: readonly ProduitDuLot[]
}): ProduitDuLot[] {
  const parId = new Map(
    (f.produits ?? []).map((produit) => [String(produit.id), produit])
  )
  const ids = (f.produitIds ?? [...parId.keys()]).map(String)
  return ids.map((id) => parId.get(id) ?? { id, slug: "" })
}

const produitEnregistreLot: DeclarationPour<"produit.enregistre.lot"> = (f) => {
  const produits = produitsDuLot(f)
  const identites = produits.map((produit) => ({
    id: produit.id,
    slug: produit.slug,
    slugPrecedent: produit.slugPrecedent ?? null,
    categoryId: produit.categoryId ?? null,
    categoryIdPrecedent: produit.categoryIdPrecedent ?? null,
  }))
  // Une seule réindexation pour toute la sélection, qui porte sa portée réelle ;
  // l'invalidation, elle, reste par Produit comme le genre unitaire.
  const consequences: ConsequenceCatalogue[] = [
    consequence(
      "reindexation",
      { type: "produit", id: IDENTIFIANT_LOT },
      `réindexation groupée de ${identites.length} Produits`,
      {
        action: "index.produit",
        durable: true,
        portee: identites.length,
        payload: { produits: identites },
      }
    ),
  ]
  for (const identite of identites) {
    consequences.push(
      consequence(
        "invalidation-cache",
        { type: "produit", id: identite.id },
        `invalidation du catalogue pour ${identite.id}`,
        {
          action: "invalidation.catalogue",
          durable: true,
          payload: { produit: identite },
        }
      )
    )
  }
  return {
    faits: produits.map((produit) =>
      fait("produit.enregistre", "produit", produit.id, {
        produitId: produit.id,
        slug: produit.slug,
        slugPrecedent: produit.slugPrecedent ?? null,
        categoryId: produit.categoryId ?? null,
        categoryIdPrecedent: produit.categoryIdPrecedent ?? null,
        imagesRetirees: [...(produit.imagesRetirees ?? [])],
      })
    ),
    consequences,
  }
}

const produitSupprime: DeclarationPour<"produit.supprime"> = (f) => {
  const produitId = String(f.produitId)
  const slug = String(f.slug)
  const categoryId = f.categoryId ?? null
  const imagesRetirees = [...(f.imagesRetirees ?? f.images ?? [])]
  const identite: IdentiteProduitCatalogue = { id: produitId, slug, categoryId }
  return {
    faits: [
      fait("produit.supprime", "produit", produitId, {
        produitId,
        slug,
        categoryId,
        imagesRetirees,
      }),
    ],
    consequences: [
      consequence(
        "suppression-images",
        { type: "produit", id: produitId },
        `suppression des images pour ${produitId}`,
        {
          action: "suppression.images",
          durable: true,
          payload: { urls: imagesRetirees },
        }
      ),
      consequence(
        "desindexation",
        { type: "produit", id: produitId },
        `désindexation du produit ${produitId}`,
        {
          action: "desindex.produit",
          durable: true,
          payload: { produitId },
        }
      ),
      consequence(
        "invalidation-cache",
        { type: "produit", id: produitId },
        `invalidation du catalogue après suppression ${produitId}`,
        {
          action: "invalidation.catalogue",
          durable: true,
          payload: { produit: identite },
        }
      ),
      consequence(
        "purge-catalogue",
        { type: "produit", id: produitId },
        `purge du bord après suppression ${produitId}`,
        {
          action: "purge.catalogue",
          durable: true,
          payload: { produit: identite },
        }
      ),
    ],
  }
}

const produitSupprimeLot: DeclarationPour<"produit.supprime.lot"> = (f) => {
  const produits = produitsDuLot(f)
  const urls = produits.flatMap((produit) => [
    ...(produit.images ?? produit.imagesRetirees ?? []),
  ])
  // La suppression des images reste un seul geste pour tout le lot ; la
  // désindexation, l'invalidation et la purge suivent par Produit, comme les
  // Événements unitaires que le travailleur redéclarera.
  const consequences: ConsequenceCatalogue[] = [
    consequence(
      "suppression-images",
      { type: "produit", id: IDENTIFIANT_LOT },
      `suppression des images groupée de ${produits.length} Produits`,
      {
        action: "suppression.images",
        durable: true,
        portee: produits.length,
        payload: { urls },
      }
    ),
  ]
  for (const produit of produits) {
    const identite: IdentiteProduitCatalogue = {
      id: produit.id,
      slug: produit.slug,
      categoryId: produit.categoryId ?? null,
    }
    consequences.push(
      consequence(
        "desindexation",
        { type: "produit", id: produit.id },
        `désindexation du produit ${produit.id}`,
        {
          action: "desindex.produit",
          durable: true,
          payload: { produitId: produit.id },
        }
      ),
      consequence(
        "invalidation-cache",
        { type: "produit", id: produit.id },
        `invalidation du catalogue après suppression ${produit.id}`,
        {
          action: "invalidation.catalogue",
          durable: true,
          payload: { produit: identite },
        }
      ),
      consequence(
        "purge-catalogue",
        { type: "produit", id: produit.id },
        `purge du bord après suppression ${produit.id}`,
        {
          action: "purge.catalogue",
          durable: true,
          payload: { produit: identite },
        }
      )
    )
  }
  return {
    faits: produits.map((produit) =>
      fait("produit.supprime", "produit", produit.id, {
        produitId: produit.id,
        slug: produit.slug,
        categoryId: produit.categoryId ?? null,
        imagesRetirees: [...(produit.images ?? produit.imagesRetirees ?? [])],
      })
    ),
    consequences,
  }
}

const varianteStockChangee: DeclarationPour<"variante.stock.changee"> = (f) => {
  const produitId = String(f.produitId)
  const identite: IdentiteProduitCatalogue = {
    id: produitId,
    slug: String(f.slug ?? ""),
    categoryId: f.categoryId ?? null,
  }
  return {
    faits: [
      fait("variante.stock.changee", "produit", produitId, {
        produitId,
      }),
    ],
    consequences: [
      consequence(
        "reindexation",
        { type: "produit", id: produitId },
        `réindexation du produit ${produitId}`,
        {
          action: "index.produit",
          durable: true,
          payload: { produits: [identite] },
        }
      ),
      consequence(
        "invalidation-cache",
        { type: "produit", id: produitId },
        `invalidation du cache pour ${produitId}`,
        {
          durable: false,
          reparation: "TTL",
          payload: { produit: identite },
        }
      ),
    ],
  }
}

const structureCreee: DeclarationPour<"structure.creee"> = (f) => {
  const categorieId = String(f.categorieId)
  return {
    faits: [fait("structure.creee", "categorie", categorieId, { categorieId })],
    consequences: [
      consequence(
        "invalidation-cache",
        { type: "categorie", id: categorieId },
        `invalidation de la structure ${categorieId}`,
        {
          action: "invalidation.structure",
          durable: true,
          payload: { categorieId },
        }
      ),
    ],
  }
}

const structureModifiee: DeclarationPour<"structure.modifiee"> = (f) => {
  const categorieId = String(f.categorieId)
  // Les conséquences se dérivent des champs que la Charge porte déjà ; les
  // faits singuliers de l'écriture (`imageRetiree`, `destination`) ne servent
  // qu'à construire ces tableaux au site d'appel.
  const imagesRetirees = [...(f.imagesRetirees ?? [])]
  const destinations = [...new Set(f.destinations ?? [])]
  const consequences: ConsequenceStructure[] = []
  if (imagesRetirees.length > 0) {
    consequences.push(
      consequence(
        "suppression-images",
        { type: "categorie", id: categorieId },
        `suppression de l'image de la structure ${categorieId}`,
        {
          action: "suppression.images",
          durable: true,
          payload: { urls: imagesRetirees },
        }
      )
    )
  }
  consequences.push(
    consequence(
      "reindexation",
      { type: "categorie", id: categorieId },
      `réindexation de la structure ${categorieId}`,
      {
        action: "index.structure",
        durable: true,
        payload: { branche: categorieId },
      }
    ),
    consequence(
      "invalidation-cache",
      { type: "categorie", id: categorieId },
      `invalidation de la structure ${categorieId}`,
      {
        action: "invalidation.structure",
        durable: true,
        payload: { categorieId },
      }
    )
  )
  return {
    faits: [
      fait("structure.modifiee", "categorie", categorieId, {
        categorieId,
        imagesRetirees,
        destinations,
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

const structureSupprimee: DeclarationPour<"structure.supprimee"> = (f) => {
  const categorieId = String(f.categorieId)
  // La branche Sans Structure voyage dans `destinations` comme n'importe
  // quelle destination : la déclaration n'a plus à relire les faits singuliers
  // pour savoir quoi réindexer.
  const imagesRetirees = [...(f.imagesRetirees ?? [])]
  const destinations = [...new Set(f.destinations ?? [])]
  const consequences: ConsequenceStructure[] = []
  for (const destination of destinations) {
    const orphelins = destination === BRANCHE_SANS_STRUCTURE
    consequences.push(
      consequence(
        "reindexation",
        { type: "categorie", id: destination },
        orphelins
          ? "réindexation des Produits orphelins"
          : `réindexation de la structure ${destination}`,
        {
          action: "index.structure",
          durable: true,
          payload: { branche: destination },
        }
      )
    )
  }
  if (imagesRetirees.length > 0) {
    consequences.push(
      consequence(
        "suppression-images",
        { type: "categorie", id: categorieId },
        `suppression de l'image de la structure ${categorieId}`,
        {
          action: "suppression.images",
          durable: true,
          payload: { urls: imagesRetirees },
        }
      )
    )
  }
  consequences.push(
    consequence(
      "invalidation-cache",
      { type: "categorie", id: categorieId },
      `invalidation de la structure ${categorieId}`,
      {
        action: "invalidation.structure",
        durable: true,
        payload: { categorieId },
      }
    )
  )
  return {
    faits: [
      fait("structure.supprimee", "categorie", categorieId, {
        categorieId,
        imagesRetirees,
        destinations,
      }),
    ],
    consequences,
  }
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
 * journal et sa propre limite d'échec. La charge utile porte l'identité du
 * Produit ; l'événement Catalogue, qui vient de la Structure, traverse la
 * lecture après commit de l'adaptateur.
 */
const imageTexteAlternatif: DeclarationPour<"image.texte-alternatif"> = (
  f
) => ({
  faits: [],
  consequences: (f.produits ?? []).map((produit) =>
    consequence(
      "invalidation-cache",
      { type: "produit", id: produit.id },
      `invalidation du cache catalogue pour le Produit ${produit.id} après modification du Texte alternatif`,
      { durable: false, reparation: "TTL", payload: { produit } }
    )
  ),
})

/**
 * Les plans que les tranches ont déjà typés. Un genre absent rend le plan
 * générique : la tranche suivante l'ajoute ici sans toucher au registre.
 */
export type PlansTypés = {
  "commande.creee": PlanCommande
  "commande.statut.changee": PlanCommande
  "structure.creee": PlanStructure
  "structure.modifiee": PlanStructure
  "structure.supprimee": PlanStructure
  "produit.enregistre": PlanCatalogue
  "produit.enregistre.lot": PlanCatalogue
  "produit.supprime": PlanCatalogue
  "produit.supprime.lot": PlanCatalogue
  "variante.stock.changee": PlanCatalogue
  "image.texte-alternatif": PlanCatalogue
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
  slug: string
  slugPrecedent?: string | null
  categoryId?: string | null
  categoryIdPrecedent?: string | null
  imagesRetirees?: readonly string[]
  galerie?: readonly unknown[]
  entreesRegistre?: readonly EntreeRegistreImageProduit[]
  promotions?: readonly PreuvePromotion[]
  ownerId?: string | null
}

export interface ProduitDuLot {
  id: string
  slug: string
  slugPrecedent?: string | null
  categoryId?: string | null
  categoryIdPrecedent?: string | null
  imagesRetirees?: readonly string[]
  images?: readonly string[]
}

export type FaitsProduitEnregistreLot = {
  produitIds?: readonly string[]
  produits?: readonly ProduitDuLot[]
}

export type FaitsProduitSupprime = {
  produitId: string | number
  slug: string
  categoryId?: string | null
  images?: readonly string[]
  imagesRetirees?: readonly string[]
}

export type FaitsProduitSupprimeLot = {
  produitIds?: readonly string[]
  produits?: readonly ProduitDuLot[]
}

export type FaitsVarianteStockChangee = {
  produitId: string | number
  /** La Charge ne porte que l'identifiant : la déclaration redéclarée s'en passe. */
  slug?: string
  categoryId?: string | null
}

export type FaitsStructureCreee = {
  categorieId: string | number
}

export type FaitsStructureModifiee = {
  categorieId: string | number
  /** Les images retirées, telles que la Charge les porte. */
  imagesRetirees: readonly string[]
  /** Les branches de destination, telles que la Charge les porte. */
  destinations: readonly string[]
}

export type FaitsStructureSupprimee = {
  categorieId: string | number
  /** Les images retirées, telles que la Charge les porte. */
  imagesRetirees: readonly string[]
  /**
   * Les branches de destination, telles que la Charge les porte. La branche
   * Sans Structure y figure sous son pseudo-identifiant quand des Produits
   * sont laissés orphelins.
   */
  destinations: readonly string[]
}

export type FaitsVilleCreee = { villeId: string | number }
export type FaitsVilleModifiee = { villeId: string | number }
export type FaitsVilleSupprimee = { villeId: string | number }
export type FaitsLivraisonReglee = { livraisonId?: string | number }
export type FaitsImageTexteAlternatif = {
  produits?: readonly IdentiteProduitCatalogue[]
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
    slug: "produit-modele",
    imagesRetirees: ["https://cdn.example.test/modele.jpg"],
  },
  "structure.modifiee": {
    categorieId: "categorie-modele",
    imagesRetirees: ["https://cdn.example.test/modele.jpg"],
    destinations: ["categorie-modele-parente"],
  },
  "structure.supprimee": {
    categorieId: "categorie-modele",
    imagesRetirees: ["https://cdn.example.test/modele.jpg"],
    destinations: ["categorie-modele-cible"],
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
