import { z } from "zod"

/**
 * Module neutre de la charge d'un Fait (ADR-0049, addendum). Il n'importe que
 * Zod : pas de Prisma, pas de `server-only`, pas de lecture, pas d'horloge.
 * C'est la seule description de ce qu'un Événement d'automatisation porte.
 */

export const TYPES_EVENEMENT_AUTOMATION = Object.freeze([
  "commande.creee",
  "commande.statut.changee",
  "produit.enregistre",
  "produit.supprime",
  "variante.stock.changee",
  "structure.creee",
  "structure.modifiee",
  "structure.supprimee",
  "planification.digest-stock-bas",
  "planification.reconciliation-recherche",
] as const)

export type TypeEvenementAutomation =
  (typeof TYPES_EVENEMENT_AUTOMATION)[number]

export const typeEvenementAutomationSchema = z.enum(TYPES_EVENEMENT_AUTOMATION)

export const TYPES_ENTITE_AUTOMATION = Object.freeze([
  "commande",
  "produit",
  "categorie",
  "planification",
] as const)

export type TypeEntiteAutomation = (typeof TYPES_ENTITE_AUTOMATION)[number]

export const typeEntiteAutomationSchema = z.enum(TYPES_ENTITE_AUTOMATION)

const emailSnapshotItemSchema = z.object({
  productName: z.string(),
  variantName: z.string(),
  quantity: z.number().int(),
  price: z.number().int(),
})

export const snapshotCommandeSchema = z.object({
  userEmail: z.string().min(1),
  orderId: z.string().min(1),
  items: z.array(emailSnapshotItemSchema),
  total: z.number().int(),
  shippingFee: z.number().int(),
  totalPayable: z.number().int(),
  cityName: z.string(),
  address: z.string(),
  phone: z.string(),
})

export type OrderEmailSnapshot = z.infer<typeof snapshotCommandeSchema>

export const chargeCommandeCreeeSchema = z.object({
  snapshot: snapshotCommandeSchema,
})

export const chargeCommandeStatutChangeeSchema =
  chargeCommandeCreeeSchema.extend({
    statut: z.enum([
      "pending",
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
      "returned",
    ]),
  })

export const chargeProduitEnregistreSchema = z.object({
  produitId: z.string().min(1),
  slug: z.string().min(1),
  slugPrecedent: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryIdPrecedent: z.string().nullable(),
  imagesRetirees: z.array(z.string()).optional(),
})

export const chargeProduitSupprimeSchema = z.object({
  produitId: z.string().min(1),
  slug: z.string().min(1),
  categoryId: z.string().nullable(),
  imagesRetirees: z.array(z.string()),
})

export const chargeVarianteStockChangeeSchema = z.object({
  produitId: z.string().min(1),
})

export const chargeStructureCreeeSchema = z.object({
  categorieId: z.string().min(1),
})

export const chargeStructureModifieeSchema = z.object({
  categorieId: z.string().min(1),
  imagesRetirees: z.array(z.string()),
  destinations: z.array(z.string().min(1)),
})

export const chargeStructureSupprimeeSchema = z.object({
  categorieId: z.string().min(1),
  imagesRetirees: z.array(z.string()),
  destinations: z.array(z.string()),
  produitsSansStructure: z.boolean().optional(),
})

export const chargePlanificationDigestStockBasSchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const chargePlanificationReconciliationRechercheSchema =
  chargePlanificationDigestStockBasSchema

export const CHARGES_PAR_DECLENCHEUR = {
  "commande.creee": chargeCommandeCreeeSchema,
  "commande.statut.changee": chargeCommandeStatutChangeeSchema,
  "produit.enregistre": chargeProduitEnregistreSchema,
  "produit.supprime": chargeProduitSupprimeSchema,
  "variante.stock.changee": chargeVarianteStockChangeeSchema,
  "structure.creee": chargeStructureCreeeSchema,
  "structure.modifiee": chargeStructureModifieeSchema,
  "structure.supprimee": chargeStructureSupprimeeSchema,
  "planification.digest-stock-bas": chargePlanificationDigestStockBasSchema,
  "planification.reconciliation-recherche":
    chargePlanificationReconciliationRechercheSchema,
} satisfies Record<TypeEvenementAutomation, z.ZodTypeAny>

export const TYPE_ENTITE_PAR_DECLENCHEUR = {
  "commande.creee": "commande",
  "commande.statut.changee": "commande",
  "produit.enregistre": "produit",
  "produit.supprime": "produit",
  "variante.stock.changee": "produit",
  "structure.creee": "categorie",
  "structure.modifiee": "categorie",
  "structure.supprimee": "categorie",
  "planification.digest-stock-bas": "planification",
  "planification.reconciliation-recherche": "planification",
} satisfies Record<TypeEvenementAutomation, TypeEntiteAutomation>

export type ChargeParDeclencheur = {
  [K in TypeEvenementAutomation]: z.infer<(typeof CHARGES_PAR_DECLENCHEUR)[K]>
}

export type Charge<D extends TypeEvenementAutomation> = ChargeParDeclencheur[D]

// Aliases de noms possibles pour le map des schémas.
export const chargesParDeclencheur = CHARGES_PAR_DECLENCHEUR
export const chargeParDeclencheur = CHARGES_PAR_DECLENCHEUR
export const schemasDeChargeParDeclencheur = CHARGES_PAR_DECLENCHEUR
export const schemasParDeclencheur = CHARGES_PAR_DECLENCHEUR
export const chargeSchemaParDeclencheur = CHARGES_PAR_DECLENCHEUR
export const schemasDeCharge = CHARGES_PAR_DECLENCHEUR

// Alias pour le map entité.
export const entiteParDeclencheur = TYPE_ENTITE_PAR_DECLENCHEUR
export const entiteTypeParDeclencheur = TYPE_ENTITE_PAR_DECLENCHEUR
export const entityTypeParDeclencheur = TYPE_ENTITE_PAR_DECLENCHEUR
export const typeEntiteParDeclencheur = TYPE_ENTITE_PAR_DECLENCHEUR
