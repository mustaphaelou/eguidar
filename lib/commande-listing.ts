import {
  defineAdminListing,
  PAGE_SIZES,
  type ListingParamsOf,
  type RawSearchParams,
} from "@/lib/admin-listing"
import { STATUTS_VALIDES } from "@/lib/statut-de-commande"

const COMMANDE_TRI_VALUES = ["date", "total"] as const

export const DATE_COLUMN_ID = "date"
export const STATUT_COLUMN_ID = "statut"
export const TOTAL_COLUMN_ID = "total"

export const COMMANDE_LISTING = defineAdminListing({
  path: "/admin/commandes",
  sortColumns: COMMANDE_TRI_VALUES,
  defaultSort: "date",
  defaultPageSize: PAGE_SIZES[0],
  filters: {
    statuses: {
      kind: "multi-enum",
      param: "statut",
      columnId: STATUT_COLUMN_ID,
      values: STATUTS_VALIDES,
    },
  },
})

export type CommandeListingParams = ListingParamsOf<typeof COMMANDE_LISTING>

export const COMMANDE_LISTING_TRI_DEFAULT = COMMANDE_LISTING.defaults.tri
export const COMMANDE_LISTING_SENS_DEFAULT = COMMANDE_LISTING.defaults.sens
export const COMMANDE_LISTING_PAGE_DEFAULT = COMMANDE_LISTING.defaults.page
export const COMMANDE_LISTING_PAGE_SIZE_DEFAULT =
  COMMANDE_LISTING.defaults.pageSize

export function parseCommandeListingParams(
  raw: RawSearchParams
): CommandeListingParams {
  return COMMANDE_LISTING.parse(raw)
}

export function buildCommandeListingUrl(view: CommandeListingParams): string {
  return COMMANDE_LISTING.buildUrl(view)
}
