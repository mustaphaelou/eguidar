import type { OrderStatus } from "@/lib/generated/prisma/client"
import { STATUTS_VALIDES } from "@/lib/order-status"
import { PAGE_SIZES } from "@/lib/table-config"

const COMMANDE_LISTING_PATH = "/admin/commandes"

export interface CommandeListingParams {
  statuses?: OrderStatus[]
  q?: string
  tri?: "date" | "total"
  sens?: "asc" | "desc"
  page?: number
  pageSize?: (typeof PAGE_SIZES)[number]
}

export const COMMANDE_LISTING_TRI_DEFAULT: NonNullable<
  CommandeListingParams["tri"]
> = "date"

export const COMMANDE_LISTING_SENS_DEFAULT: NonNullable<
  CommandeListingParams["sens"]
> = "desc"

export const COMMANDE_LISTING_PAGE_DEFAULT = 1

export const COMMANDE_LISTING_PAGE_SIZE_DEFAULT: (typeof PAGE_SIZES)[number] =
  PAGE_SIZES[0]

function firstValue(
  raw: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

export function parseCommandeListingParams(
  raw: Record<string, string | string[] | undefined>
): CommandeListingParams {
  const statusTokens = (firstValue(raw, "statut") ?? "").split(",")
  const statuses = [
    ...new Set(
      statusTokens
        .map((token) => token.trim())
        .filter((token): token is OrderStatus =>
          (STATUTS_VALIDES as readonly string[]).includes(token)
        )
    ),
  ]

  const pageRaw = Number(firstValue(raw, "page"))
  const pageSizeRaw = Number(firstValue(raw, "pageSize"))
  const triRaw = firstValue(raw, "tri")
  const sensRaw = firstValue(raw, "sens")
  const qRaw = firstValue(raw, "q")?.trim()

  return {
    ...(statuses.length > 0 ? { statuses } : {}),
    ...(qRaw ? { q: qRaw } : {}),
    tri:
      triRaw === "date" || triRaw === "total"
        ? triRaw
        : COMMANDE_LISTING_TRI_DEFAULT,
    sens:
      sensRaw === "asc" || sensRaw === "desc"
        ? sensRaw
        : COMMANDE_LISTING_SENS_DEFAULT,
    page:
      Number.isInteger(pageRaw) && pageRaw >= 1
        ? pageRaw
        : COMMANDE_LISTING_PAGE_DEFAULT,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
      ? (pageSizeRaw as (typeof PAGE_SIZES)[number])
      : COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
  }
}

export function buildCommandeListingUrl(view: CommandeListingParams): string {
  const page = view.page ?? COMMANDE_LISTING_PAGE_DEFAULT
  const pageSize = view.pageSize ?? COMMANDE_LISTING_PAGE_SIZE_DEFAULT
  const q = view.q?.trim()
  const tri = view.tri ?? COMMANDE_LISTING_TRI_DEFAULT
  const sens = view.sens ?? COMMANDE_LISTING_SENS_DEFAULT

  const searchParams = new URLSearchParams()
  if (page > 1) searchParams.set("page", String(page))
  if (pageSize !== COMMANDE_LISTING_PAGE_SIZE_DEFAULT)
    searchParams.set("pageSize", String(pageSize))
  if (view.statuses && view.statuses.length > 0)
    searchParams.set("statut", view.statuses.join(","))
  if (q) searchParams.set("q", q)
  if (tri !== COMMANDE_LISTING_TRI_DEFAULT) searchParams.set("tri", tri)
  if (sens !== COMMANDE_LISTING_SENS_DEFAULT) searchParams.set("sens", sens)
  const query = searchParams.toString()
  return query ? `${COMMANDE_LISTING_PATH}?${query}` : COMMANDE_LISTING_PATH
}

export type CommandeListingView = {
  pageIndex: number
  pageSize: (typeof PAGE_SIZES)[number]
  q: string
  statuses: OrderStatus[]
  tri: "date" | "total"
  sens: "asc" | "desc"
}

export function viewFromParams(
  params: CommandeListingParams,
  pageCount: number
): CommandeListingView {
  return {
    pageIndex: Math.min((params.page ?? 1) - 1, Math.max(0, pageCount - 1)),
    pageSize: params.pageSize ?? COMMANDE_LISTING_PAGE_SIZE_DEFAULT,
    q: params.q ?? "",
    statuses: params.statuses ? [...params.statuses] : [],
    tri: params.tri ?? COMMANDE_LISTING_TRI_DEFAULT,
    sens: params.sens ?? COMMANDE_LISTING_SENS_DEFAULT,
  }
}

export function signatureOf(view: CommandeListingView): string {
  return JSON.stringify({
    p: view.pageIndex,
    s: view.pageSize,
    q: view.q.trim(),
    f: [...view.statuses],
    t: view.tri,
    d: view.sens,
  })
}

export function hrefOf(view: CommandeListingView): string {
  return buildCommandeListingUrl({
    page: view.pageIndex + 1,
    pageSize: view.pageSize,
    q: view.q,
    statuses: view.statuses,
    tri: view.tri,
    sens: view.sens,
  })
}

export function reconcile(
  params: CommandeListingParams,
  pageCount: number,
  lastPushedSignature: string
): { echo: boolean; view: CommandeListingView; correctedHref?: string } {
  const view = viewFromParams(params, pageCount)
  if (signatureOf(view) === lastPushedSignature) {
    return { echo: true, view }
  }
  const requestedPageIndex = (params.page ?? 1) - 1
  const correctedHref =
    view.pageIndex !== requestedPageIndex ? hrefOf(view) : undefined
  return { echo: false, view, correctedHref }
}
