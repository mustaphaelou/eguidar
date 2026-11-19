export const PAGE_SIZES = [10, 20, 50] as const

export type PageSize = (typeof PAGE_SIZES)[number]

export type SortDirection = "asc" | "desc"

export type RawSearchParams = Record<string, string | string[] | undefined>

export type FilterKind =
  "multi-enum" | "single-enum" | "single-token" | "boolean-flag"

interface BaseFilterDefinition {
  readonly kind: FilterKind
  readonly param?: string
  readonly columnId?: string
}

interface EnumFilterDefinition extends BaseFilterDefinition {
  readonly kind: "multi-enum" | "single-enum"
  readonly values: readonly string[]
}

interface TokenFilterDefinition extends BaseFilterDefinition {
  readonly kind: "single-token" | "boolean-flag"
}

export type AdminListingFilterDefinition =
  EnumFilterDefinition | TokenFilterDefinition

export type ListingFilterDefinitions = Record<
  string,
  AdminListingFilterDefinition
>

export interface AdminListingDescriptor<
  Sort extends string = string,
  Filters extends ListingFilterDefinitions = ListingFilterDefinitions,
> {
  readonly path: string
  readonly sortColumns: readonly Sort[]
  readonly defaultSort: Sort
  readonly defaultSens?: SortDirection
  readonly defaultPageSize: PageSize
  readonly filters: Filters
}

export interface ResolvedFilter {
  readonly key: string
  readonly kind: FilterKind
  readonly param: string
  readonly columnId: string
  readonly values: readonly string[]
}

type FilterValue<Filter extends AdminListingFilterDefinition> = Filter extends {
  kind: "multi-enum"
  values: readonly (infer Value)[]
}
  ? Value[]
  : Filter extends { kind: "single-enum"; values: readonly (infer Value)[] }
    ? Value
    : Filter extends { kind: "single-token" }
      ? string
      : Filter extends { kind: "boolean-flag" }
        ? boolean
        : never

export type ListingParams<
  Sort extends string,
  Filters extends ListingFilterDefinitions,
> = {
  q?: string
  page?: number
  pageSize?: PageSize
  tri?: Sort
  sens?: SortDirection
} & {
  [Key in keyof Filters]?: FilterValue<Filters[Key]>
}

export interface AdminListing<
  Sort extends string = string,
  Filters extends ListingFilterDefinitions = ListingFilterDefinitions,
> {
  readonly path: string
  readonly sortColumns: readonly Sort[]
  readonly defaults: Readonly<{
    page: number
    pageSize: PageSize
    tri: Sort
    sens: SortDirection
  }>
  readonly filters: readonly ResolvedFilter[]
  parse(raw: RawSearchParams): ListingParams<Sort, Filters>
  buildUrl(view: ListingParams<Sort, Filters>): string
}

export type ListingParamsOf<Listing> =
  Listing extends AdminListing<infer Sort, infer Filters>
    ? ListingParams<Sort, Filters>
    : never

const RESERVED_PARAMS: ReadonlySet<string> = new Set([
  "page",
  "pageSize",
  "q",
  "tri",
  "sens",
])

const EMPTY_VALUES: readonly string[] = Object.freeze([])

function firstValue(
  raw: RawSearchParams | undefined,
  key: string
): string | undefined {
  const value = raw?.[key]
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined
  }
  return typeof value === "string" ? value : undefined
}

function isEnumFilter(
  filter: AdminListingFilterDefinition
): filter is EnumFilterDefinition {
  return filter.kind === "multi-enum" || filter.kind === "single-enum"
}

function validateDescriptor<
  Sort extends string,
  Filters extends ListingFilterDefinitions,
>(descriptor: AdminListingDescriptor<Sort, Filters>): void {
  const { path, sortColumns, defaultSort, defaultPageSize, filters } =
    descriptor

  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new Error(`Invalid listing path: ${path}`)
  }
  if (
    sortColumns.length === 0 ||
    new Set(sortColumns).size !== sortColumns.length
  ) {
    throw new Error(`Invalid listing sort columns: ${path}`)
  }
  if (!sortColumns.includes(defaultSort)) {
    throw new Error(`Default sort is not a sort column: ${defaultSort}`)
  }
  if (!(PAGE_SIZES as readonly number[]).includes(defaultPageSize)) {
    throw new Error(`Invalid default page size: ${defaultPageSize}`)
  }

  const params = new Set<string>(RESERVED_PARAMS)
  const columnIds = new Set<string>()

  for (const [key, filter] of Object.entries(filters)) {
    const param = filter.param ?? key
    const columnId = filter.columnId ?? param

    if (params.has(param))
      throw new Error(`Reserved or duplicate filter param: ${param}`)
    params.add(param)

    if (columnIds.has(columnId)) {
      throw new Error(`Duplicate filter columnId: ${columnId}`)
    }
    columnIds.add(columnId)

    if (isEnumFilter(filter)) {
      const { values } = filter
      if (
        values.length === 0 ||
        values.some((value) => value.length === 0) ||
        new Set(values).size !== values.length
      ) {
        throw new Error(`Invalid filter enum values: ${param}`)
      }
      if (
        filter.kind === "multi-enum" &&
        values.some((value) => value.includes(","))
      ) {
        throw new Error(`Multi-enum value contains a comma: ${param}`)
      }
    }
  }
}

export function defineAdminListing<
  const Sort extends string,
  const Filters extends ListingFilterDefinitions,
>(
  descriptor: AdminListingDescriptor<Sort, Filters>
): AdminListing<Sort, Filters> {
  validateDescriptor(descriptor)

  const path = descriptor.path
  const sortColumns = Object.freeze([
    ...descriptor.sortColumns,
  ]) as readonly Sort[]
  const defaults = Object.freeze({
    page: 1,
    pageSize: descriptor.defaultPageSize,
    tri: descriptor.defaultSort,
    sens: descriptor.defaultSens ?? "desc",
  })
  const sortSet: ReadonlySet<string> = new Set(sortColumns)
  const pageSizeSet: ReadonlySet<number> = new Set(PAGE_SIZES)

  const filters: readonly ResolvedFilter[] = Object.freeze(
    Object.entries(descriptor.filters).map(([key, filter]) => {
      const param = filter.param ?? key
      return Object.freeze({
        key,
        kind: filter.kind,
        param,
        columnId: filter.columnId ?? param,
        values: isEnumFilter(filter)
          ? (Object.freeze([...filter.values]) as readonly string[])
          : EMPTY_VALUES,
      })
    })
  )

  const valuesByParam = new Map<string, ReadonlySet<string>>(
    filters
      .filter((filter) => filter.values.length > 0)
      .map((filter) => [filter.param, new Set(filter.values)])
  )

  function parse(raw: RawSearchParams): ListingParams<Sort, Filters> {
    const parsed: Record<string, unknown> = {}

    const pageRaw = Number(firstValue(raw, "page"))
    parsed.page =
      Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : defaults.page

    const pageSizeRaw = Number(firstValue(raw, "pageSize"))
    parsed.pageSize = pageSizeSet.has(pageSizeRaw)
      ? (pageSizeRaw as PageSize)
      : defaults.pageSize

    const q = firstValue(raw, "q")?.trim()
    if (q) parsed.q = q

    for (const filter of filters) {
      const rawValue = firstValue(raw, filter.param)
      if (rawValue === undefined) continue

      if (filter.kind === "multi-enum") {
        const allowed = valuesByParam.get(filter.param)
        const values = [
          ...new Set(
            rawValue
              .split(",")
              .map((token) => token.trim())
              .filter((token) => allowed?.has(token) === true)
          ),
        ]
        if (values.length > 0) parsed[filter.key] = values
      } else if (filter.kind === "single-enum") {
        if (valuesByParam.get(filter.param)?.has(rawValue) === true) {
          parsed[filter.key] = rawValue
        }
      } else if (filter.kind === "single-token") {
        const token = rawValue.trim()
        if (token) parsed[filter.key] = token
      } else if (rawValue === "1") {
        parsed[filter.key] = true
      }
    }

    const triRaw = firstValue(raw, "tri")
    parsed.tri =
      triRaw !== undefined && sortSet.has(triRaw)
        ? (triRaw as Sort)
        : defaults.tri

    const sensRaw = firstValue(raw, "sens")
    parsed.sens =
      sensRaw === "asc" || sensRaw === "desc" ? sensRaw : defaults.sens

    return parsed as ListingParams<Sort, Filters>
  }

  function buildUrl(view: ListingParams<Sort, Filters>): string {
    const values = view as Record<string, unknown>
    const searchParams = new URLSearchParams()

    const requestedPage = Number(view.page)
    const page =
      Number.isInteger(requestedPage) && requestedPage > 1
        ? requestedPage
        : defaults.page
    if (page > 1) searchParams.set("page", String(page))

    const requestedPageSize = Number(view.pageSize)
    const pageSize = pageSizeSet.has(requestedPageSize)
      ? (requestedPageSize as PageSize)
      : defaults.pageSize
    if (pageSize !== defaults.pageSize) {
      searchParams.set("pageSize", String(pageSize))
    }

    const q = typeof view.q === "string" ? view.q.trim() : ""
    if (q) searchParams.set("q", q)

    for (const filter of filters) {
      const value = values[filter.key]

      if (filter.kind === "multi-enum") {
        const allowed = valuesByParam.get(filter.param)
        const selected = [
          ...new Set(
            (Array.isArray(value) ? value : []).filter(
              (token): token is string =>
                typeof token === "string" && allowed?.has(token) === true
            )
          ),
        ]
        if (selected.length > 0)
          searchParams.set(filter.param, selected.join(","))
      } else if (filter.kind === "single-enum") {
        if (
          typeof value === "string" &&
          valuesByParam.get(filter.param)?.has(value) === true
        ) {
          searchParams.set(filter.param, value)
        }
      } else if (filter.kind === "single-token") {
        if (typeof value === "string" && value.trim()) {
          searchParams.set(filter.param, value.trim())
        }
      } else if (value === true) {
        searchParams.set(filter.param, "1")
      }
    }

    const tri =
      typeof view.tri === "string" && sortSet.has(view.tri)
        ? view.tri
        : defaults.tri
    if (tri !== defaults.tri) searchParams.set("tri", tri)

    const sens =
      view.sens === "asc" || view.sens === "desc" ? view.sens : defaults.sens
    if (sens !== defaults.sens) searchParams.set("sens", sens)

    const query = searchParams.toString()
    return query ? `${path}?${query}` : path
  }

  return Object.freeze({
    path,
    sortColumns,
    defaults,
    filters,
    parse,
    buildUrl,
  })
}
