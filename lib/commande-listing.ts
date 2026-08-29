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
    tri: triRaw === "date" || triRaw === "total" ? triRaw : "date",
    sens: sensRaw === "asc" || sensRaw === "desc" ? sensRaw : "desc",
    page: Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
      ? (pageSizeRaw as (typeof PAGE_SIZES)[number])
      : PAGE_SIZES[0],
  }
}

export function buildCommandeListingUrl(view: CommandeListingParams): string {
  const page = view.page ?? 1
  const pageSize = view.pageSize ?? PAGE_SIZES[0]
  const q = view.q?.trim()
  const tri = view.tri ?? "date"
  const sens = view.sens ?? "desc"

  const searchParams = new URLSearchParams()
  if (page > 1) searchParams.set("page", String(page))
  if (pageSize !== PAGE_SIZES[0]) searchParams.set("pageSize", String(pageSize))
  if (view.statuses && view.statuses.length > 0)
    searchParams.set("statut", view.statuses.join(","))
  if (q) searchParams.set("q", q)
  if (tri !== "date") searchParams.set("tri", tri)
  if (sens !== "desc") searchParams.set("sens", sens)
  const query = searchParams.toString()
  return query ? `${COMMANDE_LISTING_PATH}?${query}` : COMMANDE_LISTING_PATH
}
