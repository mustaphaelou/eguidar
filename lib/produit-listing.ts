import {
  defineAdminListing,
  type ListingParamsOf,
  type RawSearchParams,
} from "@/lib/admin-listing"

export const PRODUIT_STRUCTURE_SANS = "sans_structure"
export const PRODUIT_STOCK_ZERO = "zero"
export const PRODUIT_STOCK_NON_NUL = "non-zero"

export const PRODUIT_STOCK_VALUES = [
  PRODUIT_STOCK_ZERO,
  PRODUIT_STOCK_NON_NUL,
] as const

export type ProduitStockFiltre = (typeof PRODUIT_STOCK_VALUES)[number]

export const PRODUIT_TRI_VALUES = ["nom", "prix", "stock", "date"] as const

export type ProduitTri = (typeof PRODUIT_TRI_VALUES)[number]

export const NOM_COLUMN_ID = "nom"
export const PRIX_COLUMN_ID = "prix"
export const STOCK_COLUMN_ID = "stock"
export const DATE_COLUMN_ID = "date"
export const STRUCTURE_COLUMN_ID = "structure"
export const MISE_EN_AVANT_COLUMN_ID = "misEnAvant"
export const LIVRAISON_OFFERTE_COLUMN_ID = "livraisonOfferte"
export const SELECTION_COLUMN_ID = "selection"
export const ACTIONS_COLUMN_ID = "actions"

export const PRODUIT_LISTING = defineAdminListing({
  path: "/admin/produits",
  sortColumns: PRODUIT_TRI_VALUES,
  defaultSort: "date",
  defaultPageSize: 50,
  filters: {
    structure: {
      kind: "single-token",
      columnId: STRUCTURE_COLUMN_ID,
    },
    misEnAvant: {
      kind: "boolean-flag",
      columnId: MISE_EN_AVANT_COLUMN_ID,
    },
    livraisonOfferte: {
      kind: "boolean-flag",
      columnId: LIVRAISON_OFFERTE_COLUMN_ID,
    },
    stock: {
      kind: "single-enum",
      columnId: STOCK_COLUMN_ID,
      values: PRODUIT_STOCK_VALUES,
    },
  },
})

export type ProduitListingParams = ListingParamsOf<typeof PRODUIT_LISTING>

export const PRODUIT_LISTING_TRI_DEFAULT = PRODUIT_LISTING.defaults.tri
export const PRODUIT_LISTING_SENS_DEFAULT = PRODUIT_LISTING.defaults.sens
export const PRODUIT_LISTING_PAGE_DEFAULT = PRODUIT_LISTING.defaults.page
export const PRODUIT_LISTING_PAGE_SIZE_DEFAULT =
  PRODUIT_LISTING.defaults.pageSize

export function estTriProduit(value: string): value is ProduitTri {
  return (PRODUIT_TRI_VALUES as readonly string[]).includes(value)
}

export function estStockProduit(value: string): value is ProduitStockFiltre {
  return (PRODUIT_STOCK_VALUES as readonly string[]).includes(value)
}

export function parseProduitListingParams(
  raw: RawSearchParams
): ProduitListingParams {
  return PRODUIT_LISTING.parse(raw)
}

export function buildProduitListingUrl(view: ProduitListingParams): string {
  return PRODUIT_LISTING.buildUrl(view)
}
