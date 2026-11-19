import {
  defineAdminListing,
  PAGE_SIZES,
  type ListingParamsOf,
  type RawSearchParams,
} from "@/lib/admin-listing"
import { STATUTS_VALIDES } from "@/lib/statut-de-commande"

const COMMANDE_LISTING_PATH = "/admin/commandes"

export const DATE_COLUMN_ID = "date"
export const STATUT_COLUMN_ID = "statut"
export const TOTAL_COLUMN_ID = "total"

export const COMMANDE_LISTING = defineAdminListing({
  path: COMMANDE_LISTING_PATH,
  sortColumns: ["date", "total"] as const,
  defaultSort: "date",
  defaultSens: "desc",
  defaultPageSize: PAGE_SIZES[0],
  filters: [
    {
      key: "statuses",
      kind: "multi-enum",
      values: STATUTS_VALIDES,
      param: "statut",
      columnId: STATUT_COLUMN_ID,
    },
  ] as const,
})

export type CommandeListingParams = ListingParamsOf<typeof COMMANDE_LISTING>

export const COMMANDE_LISTING_TRI_DEFAULT: NonNullable<
  CommandeListingParams["tri"]
> = "date"

export const COMMANDE_LISTING_SENS_DEFAULT: NonNullable<
  CommandeListingParams["sens"]
> = "desc"

export const COMMANDE_LISTING_PAGE_DEFAULT = 1

export const COMMANDE_LISTING_PAGE_SIZE_DEFAULT: (typeof PAGE_SIZES)[number] =
  PAGE_SIZES[0]

export function parseCommandeListingParams(
  raw: RawSearchParams
): CommandeListingParams {
  return COMMANDE_LISTING.parse(raw)
}

export function buildCommandeListingUrl(view: CommandeListingParams): string {
  return COMMANDE_LISTING.buildUrl(view)
}
