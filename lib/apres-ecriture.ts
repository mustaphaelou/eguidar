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

export interface FaitApresEcriture {
  declencheur: TypeEvenementAutomation
  entite: TypeEntiteAutomation
  identifiant: string
  charge: unknown
}

export interface ConsequenceApresEcriture {
  effet: TypeEffetPostCommit
  action?: ActionAutomation
  entite: EntiteEffetPostCommit
  message: string
  portee?: number
  durable: boolean
  reparation?: string
}

export interface PlanApresEcriture {
  faits: FaitApresEcriture[]
  consequences: ConsequenceApresEcriture[]
}

export type FaitsApresEcriture = Record<string, unknown>

type Declaration = (faits: FaitsApresEcriture) => PlanApresEcriture

function fait(
  declencheur: TypeEvenementAutomation,
  entite: TypeEntiteAutomation,
  identifiant: string,
  charge: unknown
): FaitApresEcriture {
  return { declencheur, entite, identifiant, charge }
}

function consequence(
  effet: TypeEffetPostCommit,
  entite: EntiteEffetPostCommit,
  message: string,
  options: {
    action?: ActionAutomation
    portee?: number
    durable: boolean
    reparation?: string
  }
): ConsequenceApresEcriture {
  return { effet, entite, message, ...options }
}

// Commande
const commandeCreee: Declaration = (f) => ({
  faits: [
    fait("commande.creee", "commande", String(f.commandeId), {
      snapshot: f.snapshot,
    }),
  ],
  consequences: [
    consequence(
      "email",
      { type: "commande", id: String(f.commandeId) },
      String(
        f.messageEmail ??
          `[order] e-mail de confirmation non envoyé pour ${f.commandeId}`
      ),
      {
        action: "email.commande-creee",
        durable: true,
      }
    ),
    consequence(
      "invalidation-cache",
      { type: "commande", id: String(f.commandeId) },
      String(
        f.messageInvalidation ??
          `[order] invalidation du cache non effectuée pour ${f.commandeId}`
      ),
      { durable: false, reparation: "TTL" }
    ),
    consequence(
      "purge-catalogue",
      { type: "commande", id: String(f.commandeId) },
      String(
        f.messagePurge ??
          `[order] purge des documents du catalogue non effectuée pour ${f.commandeId}`
      ),
      { durable: false, reparation: "TTL" }
    ),
  ],
})

const commandeStatutChangee: Declaration = (f) => {
  const consequences: ConsequenceApresEcriture[] = [
    consequence(
      "email",
      { type: "commande", id: String(f.commandeId) },
      String(
        f.messageEmail ??
          `[order] e-mail de statut non envoyé pour ${f.commandeId}`
      ),
      { action: "email.commande-statut", durable: true }
    ),
    consequence(
      "invalidation-cache",
      { type: "commande", id: String(f.commandeId) },
      String(
        f.messageInvalidation ??
          `[order] invalidation du cache non effectuée pour ${f.commandeId}`
      ),
      { durable: false, reparation: "TTL" }
    ),
    consequence(
      "purge-catalogue",
      { type: "commande", id: String(f.commandeId) },
      String(
        f.messagePurge ??
          `[order] purge des documents du catalogue non effectuée pour ${f.commandeId}`
      ),
      { durable: false, reparation: "TTL" }
    ),
  ]
  return {
    faits: [
      fait("commande.statut.changee", "commande", String(f.commandeId), {
        snapshot: f.snapshot,
        statut: f.statut,
      }),
    ],
    consequences,
  }
}

// Produit enregistre
const produitEnregistre: Declaration = (f) => {
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
        produitId: f.produitId,
        slug: f.slug ?? null,
        slugPrecedent: f.slugPrecedent ?? null,
        categoryId: f.categoryId ?? null,
        categoryIdPrecedent: f.categoryIdPrecedent ?? null,
        imagesRetirees: removed,
        galerie: f.galerie ?? null,
      }),
    ],
    consequences,
  }
}

const produitEnregistreLot: Declaration = (f) => {
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
      galerie: p.galerie ?? null,
    }
  })
  const consequences: ConsequenceApresEcriture[] = [
    consequence(
      "reindexation",
      { type: "produit", id: "lot" },
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
        produitId: p.id,
        slug: p.slug,
        slugPrecedent: p.slugPrecedent,
        categoryId: p.categoryId,
        categoryIdPrecedent: p.categoryIdPrecedent,
        imagesRetirees: p.imagesRetirees,
        galerie: p.galerie,
      })
    ),
    consequences,
  }
}

const produitSupprime: Declaration = (f) => {
  const urls = (f.images as string[]) ?? []
  return {
    faits: [
      fait("produit.supprime", "produit", String(f.produitId), {
        produitId: f.produitId,
        slug: f.slug,
        categoryId: f.categoryId,
        images: urls,
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

const produitSupprimeLot: Declaration = (f) => {
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
        produitId: produit.id,
        slug: produit.slug,
        categoryId: produit.categoryId,
        images: produit.images,
      })
    ),
    consequences: [
      consequence(
        "suppression-images",
        { type: "produit", id: "lot" },
        `suppression des images groupée`,
        { action: "suppression.images", durable: true, portee }
      ),
      consequence(
        "desindexation",
        { type: "produit", id: "lot" },
        `désindexation groupée`,
        { action: "desindex.produit", durable: true, portee }
      ),
      consequence(
        "invalidation-cache",
        { type: "produit", id: "lot" },
        `invalidation du catalogue groupée après suppression`,
        { action: "invalidation.catalogue", durable: true, portee }
      ),
      consequence(
        "purge-catalogue",
        { type: "produit", id: "lot" },
        `purge du bord groupée après suppression`,
        { action: "purge.catalogue", durable: true, portee }
      ),
    ],
  }
}

const varianteStockChangee: Declaration = (f) => ({
  faits: [
    fait("variante.stock.changee", "produit", String(f.produitId), {
      produitId: f.produitId,
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

const structureCreee: Declaration = (f) => ({
  faits: [
    fait("structure.creee", "categorie", String(f.categorieId), {
      categorieId: f.categorieId,
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

const structureModifiee: Declaration = (f) => {
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
  return {
    faits: [
      fait("structure.modifiee", "categorie", String(f.categorieId), {
        categorieId: f.categorieId,
        imageRetiree: f.imageRetiree ?? null,
        destination: f.destination ?? null,
      }),
    ],
    consequences,
  }
}

const structureSupprimee: Declaration = (f) => {
  const destinations = (f.destinations as string[]) ?? []
  const consequences: ConsequenceApresEcriture[] = []
  if (f.image) {
    consequences.push(
      consequence(
        "suppression-images",
        { type: "categorie", id: String(f.categorieId) },
        `suppression de l'image de la structure ${f.categorieId}`,
        { action: "suppression.images", durable: true }
      )
    )
  }
  const branches = destinations.length > 0 ? destinations : ["sans-structure"]
  for (const dest of branches) {
    consequences.push(
      consequence(
        "reindexation",
        { type: "categorie", id: dest },
        `réindexation de la structure ${dest}`,
        { action: "index.structure", durable: true }
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
  return {
    faits: [
      fait("structure.supprimee", "categorie", String(f.categorieId), {
        categorieId: f.categorieId,
        image: f.image ?? null,
        destinations: f.destinations ?? [],
        produitsCible: f.produitsCible ?? null,
        enfantsCible: f.enfantsCible ?? null,
      }),
    ],
    consequences,
  }
}

function maintenanceDeclaration(
  effet: TypeEffetPostCommit,
  entite: EntiteEffetPostCommit,
  id: string,
  message: string
): Declaration {
  return () => ({
    faits: [],
    consequences: [
      consequence(effet, entite, message, {
        durable: false,
        reparation: "TTL",
      }),
    ],
  })
}

const REGISTRE: Record<GenreEcriture, Declaration> = {
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
  "ville.creee": (f) =>
    maintenanceDeclaration(
      "invalidation-cache",
      { type: "ville", id: String(f.villeId ?? "ville") },
      String(f.villeId ?? "ville"),
      `invalidation du cache livraison pour ${f.villeId}`
    )(f),
  "ville.modifiee": (f) =>
    maintenanceDeclaration(
      "invalidation-cache",
      { type: "ville", id: String(f.villeId ?? "ville") },
      String(f.villeId ?? "ville"),
      `invalidation du cache livraison pour ${f.villeId}`
    )(f),
  "ville.supprimee": (f) =>
    maintenanceDeclaration(
      "invalidation-cache",
      { type: "ville", id: String(f.villeId ?? "ville") },
      String(f.villeId ?? "ville"),
      `invalidation du cache livraison pour ${f.villeId}`
    )(f),
  "livraison.reglee": (f) =>
    maintenanceDeclaration(
      "invalidation-cache",
      { type: "livraison", id: String(f.id ?? "livraison") },
      String(f.id ?? "livraison"),
      `invalidation du cache livraison`
    )(f),
  "image.texte-alternatif": (f) =>
    maintenanceDeclaration(
      "invalidation-cache",
      { type: "produit", id: String(f.produitId ?? "produit") },
      String(f.produitId ?? "produit"),
      `invalidation du cache catalogue`
    )(f),
}

export function declarerApresEcriture(
  genre: GenreEcriture,
  faits: FaitsApresEcriture = {}
): PlanApresEcriture {
  const declaration = REGISTRE[genre]
  if (!declaration) throw new Error(`Genre d'écriture inconnu : ${genre}`)
  return declaration(faits)
}

// Aliases for compatibility
export const declarer = declarerApresEcriture
export const declencher = declarerApresEcriture
export const apresEcriture = declarerApresEcriture
export const obtenirPlan = declarerApresEcriture
export const planDe = declarerApresEcriture

export const APRES_ECRITURE = REGISTRE
export const DECLARATIONS = REGISTRE
export const REGISTRE_APRES_ECRITURE = REGISTRE

// Genres dont l'après-écriture est migrée : leurs Règles par défaut sont dérivées
// du plan, jamais d'une entrée parallèle.
export const GENRES_MIGRES: GenreEcriture[] = [
  "commande.creee",
  "commande.statut.changee",
  "produit.enregistre",
  "produit.supprime",
  "variante.stock.changee",
]
export const KINDS_MIGRES = GENRES_MIGRES
export const MIGRATED_KINDS = GENRES_MIGRES

// Genres dont la déclaration existe mais dont le site d'appel n'est pas encore
// migré : leurs Règles par défaut restent dans la liste en attente.
export const GENRES_EN_ATTENTE: GenreEcriture[] = (
  Object.keys(REGISTRE) as GenreEcriture[]
).filter((g) => !GENRES_MIGRES.includes(g))
export const KINDS_EN_ATTENTE = GENRES_EN_ATTENTE
export const PENDING_KINDS = GENRES_EN_ATTENTE

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
  },
}

// Liste en attente : Règles par défaut des genres non migrés, conservées ici
// (et non dans regles.ts) pour qu'une seule source possède la politique.
export const REGLES_EN_ATTENTE: Array<{
  id: string
  nom: string
  declencheur: TypeEvenementAutomation
  action: ActionAutomation
  actif?: boolean
}> = [
  {
    id: "invalidation-structure",
    nom: "Invalidation de la Structure",
    declencheur: "structure.creee",
    action: "invalidation.structure",
  },
  {
    id: "invalidation-structure-modifiee",
    nom: "Invalidation de la Structure modifiée",
    declencheur: "structure.modifiee",
    action: "invalidation.structure",
  },
  {
    id: "invalidation-structure-supprimee",
    nom: "Invalidation de la Structure supprimée",
    declencheur: "structure.supprimee",
    action: "invalidation.structure",
  },
  {
    id: "indexation-structure",
    nom: "Indexation de la Structure",
    declencheur: "structure.modifiee",
    action: "index.structure",
  },
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
export const REGLES_NON_MIGREES = REGLES_EN_ATTENTE
export const PENDING_RULES = REGLES_EN_ATTENTE

// Règles par défaut : les genres migrés les dérivent du plan, les autres viennent
// de la liste en attente.
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
  for (const genre of GENRES_MIGRES) {
    const plan = declarerApresEcriture(genre, FAITS_POUR_REGLES[genre] ?? {})
    const declencheurFait = plan.faits[0]?.declencheur
    for (const c of plan.consequences) {
      if (!c.durable || !c.action) continue
      const identite =
        IDENTITES_REGLES_MIGREES[`${declencheurFait}|${c.action}`] ??
        IDENTITES_REGLES_MIGREES[c.action]
      if (!identite) continue
      out.push({
        id: identite.id,
        nom: identite.nom,
        declencheur: (declencheurFait ?? genre) as TypeEvenementAutomation,
        action: c.action,
        condition: { type: "toujours" },
        actif: true,
      })
    }
  }
  for (const r of REGLES_EN_ATTENTE) {
    out.push({ ...r, condition: { type: "toujours" }, actif: r.actif ?? true })
  }
  return out
}
export const reglesParDefault = reglesParDefaut
export const defaultRules = reglesParDefaut
export const rulesParDefaut = reglesParDefaut

export default REGISTRE
