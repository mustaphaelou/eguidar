import { PAGE_SIZES } from "@/lib/table-config"

const PRODUIT_LISTING_PATH = "/admin/produits"

export const PRODUIT_STRUCTURE_SANS = "sans-structure"
export const PRODUIT_STOCK_ZERO = "zero"
export const PRODUIT_STOCK_NON_NUL = "non-zero"

export const PRODUIT_STOCK_VALUES = [
  PRODUIT_STOCK_ZERO,
  PRODUIT_STOCK_NON_NUL,
] as const

export type ProduitStockFiltre = (typeof PRODUIT_STOCK_VALUES)[number]

export const PRODUIT_TRI_VALUES = ["nom", "prix", "stock", "date"] as const

export type ProduitTri = (typeof PRODUIT_TRI_VALUES)[number]

export interface ProduitListingParams {
  q?: string
  /** L'identifiant d'une Structure, ou le jeton réservé aux Produits sans Structure. */
  structure?: string
  misEnAvant?: boolean
  livraisonOfferte?: boolean
  stock?: ProduitStockFiltre
  tri?: ProduitTri
  sens?: "asc" | "desc"
  page?: number
  pageSize?: (typeof PAGE_SIZES)[number]
}

export const PRODUIT_LISTING_TRI_DEFAULT: NonNullable<
  ProduitListingParams["tri"]
> = "date"

export const PRODUIT_LISTING_SENS_DEFAULT: NonNullable<
  ProduitListingParams["sens"]
> = "desc"

export const PRODUIT_LISTING_PAGE_DEFAULT = 1

export const PRODUIT_LISTING_PAGE_SIZE_DEFAULT: (typeof PAGE_SIZES)[number] = 50

export const NOM_COLUMN_ID = "nom"
export const PRIX_COLUMN_ID = "prix"
export const STOCK_COLUMN_ID = "stock"
export const DATE_COLUMN_ID = "date"
export const STRUCTURE_COLUMN_ID = "structure"
export const MISE_EN_AVANT_COLUMN_ID = "misEnAvant"
export const LIVRAISON_OFFERTE_COLUMN_ID = "livraisonOfferte"
export const SELECTION_COLUMN_ID = "selection"
export const ACTIONS_COLUMN_ID = "actions"

function firstValue(
  raw: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

function flagFromRaw(value: string | undefined): boolean | undefined {
  return value === "1" ? true : undefined
}

export function estTriProduit(value: string): value is ProduitTri {
  return (PRODUIT_TRI_VALUES as readonly string[]).includes(value)
}

export function estStockProduit(value: string): value is ProduitStockFiltre {
  return (PRODUIT_STOCK_VALUES as readonly string[]).includes(value)
}

export function parseProduitListingParams(
  raw: Record<string, string | string[] | undefined>
): ProduitListingParams {
  const qRaw = firstValue(raw, "q")?.trim()
  const structureRaw = firstValue(raw, "structure")?.trim()
  const triRaw = firstValue(raw, "tri")
  const sensRaw = firstValue(raw, "sens")
  const stockRaw = firstValue(raw, "stock")
  const pageRaw = Number(firstValue(raw, "page"))
  const pageSizeRaw = Number(firstValue(raw, "pageSize"))

  return {
    ...(qRaw ? { q: qRaw } : {}),
    ...(structureRaw ? { structure: structureRaw } : {}),
    ...(flagFromRaw(firstValue(raw, "misEnAvant")) === true
      ? { misEnAvant: true }
      : {}),
    ...(flagFromRaw(firstValue(raw, "livraisonOfferte")) === true
      ? { livraisonOfferte: true }
      : {}),
    ...(stockRaw !== undefined && estStockProduit(stockRaw)
      ? { stock: stockRaw }
      : {}),
    tri:
      triRaw !== undefined && estTriProduit(triRaw)
        ? triRaw
        : PRODUIT_LISTING_TRI_DEFAULT,
    sens:
      sensRaw === "asc" || sensRaw === "desc"
        ? sensRaw
        : PRODUIT_LISTING_SENS_DEFAULT,
    page:
      Number.isInteger(pageRaw) && pageRaw >= 1
        ? pageRaw
        : PRODUIT_LISTING_PAGE_DEFAULT,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
      ? (pageSizeRaw as (typeof PAGE_SIZES)[number])
      : PRODUIT_LISTING_PAGE_SIZE_DEFAULT,
  }
}

export function buildProduitListingUrl(view: ProduitListingParams): string {
  const page = view.page ?? PRODUIT_LISTING_PAGE_DEFAULT
  const pageSize = view.pageSize ?? PRODUIT_LISTING_PAGE_SIZE_DEFAULT
  const q = view.q?.trim()
  const structure = view.structure?.trim()
  const tri = view.tri ?? PRODUIT_LISTING_TRI_DEFAULT
  const sens = view.sens ?? PRODUIT_LISTING_SENS_DEFAULT

  const searchParams = new URLSearchParams()
  if (page > 1) searchParams.set("page", String(page))
  if (pageSize !== PRODUIT_LISTING_PAGE_SIZE_DEFAULT)
    searchParams.set("pageSize", String(pageSize))
  if (q) searchParams.set("q", q)
  if (structure) searchParams.set("structure", structure)
  if (view.misEnAvant) searchParams.set("misEnAvant", "1")
  if (view.livraisonOfferte) searchParams.set("livraisonOfferte", "1")
  if (view.stock) searchParams.set("stock", view.stock)
  if (tri !== PRODUIT_LISTING_TRI_DEFAULT) searchParams.set("tri", tri)
  if (sens !== PRODUIT_LISTING_SENS_DEFAULT) searchParams.set("sens", sens)
  const query = searchParams.toString()
  return query ? `${PRODUIT_LISTING_PATH}?${query}` : PRODUIT_LISTING_PATH
}
