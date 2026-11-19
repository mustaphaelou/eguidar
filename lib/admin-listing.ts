export const PAGE_SIZES = [10, 20, 50] as const

export type PageSize = (typeof PAGE_SIZES)[number]

export type SortDirection = "asc" | "desc"

export type RawSearchParams = Record<string, string | string[] | undefined>

export type AdminListingFilterKind =
  "multi-enum" | "single-enum" | "single-token" | "boolean-flag"

export type AdminListingFilter<Key extends string = string> =
  | {
      readonly key: Key
      readonly kind: "multi-enum"
      readonly values: readonly string[]
      readonly param?: string
      readonly columnId?: string
    }
  | {
      readonly key: Key
      readonly kind: "single-enum"
      readonly values: readonly string[]
      readonly param?: string
      readonly columnId?: string
    }
  | {
      readonly key: Key
      readonly kind: "single-token"
      readonly param?: string
      readonly columnId?: string
    }
  | {
      readonly key: Key
      readonly kind: "boolean-flag"
      readonly param?: string
      readonly columnId?: string
    }

type FilterValueOf<F> = F extends {
  kind: "multi-enum"
  values: readonly (infer V)[]
}
  ? V[]
  : F extends { kind: "single-enum"; values: readonly (infer V)[] }
    ? V
    : F extends { kind: "single-token" }
      ? string
      : F extends { kind: "boolean-flag" }
        ? boolean
        : never

export type ListingParams<
  TSort extends string,
  TFilters extends readonly AdminListingFilter[],
> = {
  q?: string
  tri?: TSort
  sens?: SortDirection
  page?: number
  pageSize?: PageSize
} & {
  [F in TFilters[number] as F["key"]]?: FilterValueOf<F>
}

export interface ListingFilterMetadata {
  readonly key: string
  readonly kind: AdminListingFilterKind
  readonly param: string
  readonly columnId: string
  readonly values: readonly string[]
  readonly allowed: ReadonlySet<string>
}

export interface AdminListingDescriptor<
  TSortColumns extends readonly string[],
  TFilters extends readonly AdminListingFilter[],
> {
  readonly path: string
  readonly sortColumns: TSortColumns
  readonly defaultSort: TSortColumns[number]
  readonly defaultSens?: SortDirection
  readonly defaultPageSize: PageSize
  readonly filters: TFilters
}

export interface CompiledAdminListing<
  TSortColumns extends readonly string[] = readonly string[],
  TFilters extends readonly AdminListingFilter[] =
    readonly AdminListingFilter[],
> {
  readonly path: string
  readonly sortColumns: TSortColumns
  readonly defaults: {
    readonly tri: TSortColumns[number]
    readonly sens: SortDirection
    readonly pageSize: PageSize
    readonly page: number
  }
  readonly filters: readonly ListingFilterMetadata[]
  parse(raw: RawSearchParams): ListingParams<TSortColumns[number], TFilters>
  buildUrl(view: ListingParams<TSortColumns[number], TFilters>): string
}

export interface AnyAdminListing {
  readonly path: string
  readonly sortColumns: readonly string[]
  readonly defaults: {
    readonly tri: string
    readonly sens: SortDirection
    readonly pageSize: PageSize
    readonly page: number
  }
  readonly filters: readonly ListingFilterMetadata[]
  parse(raw: RawSearchParams): object
  buildUrl(view: object): string
}

export type ListingParamsOf<L> =
  L extends CompiledAdminListing<infer TSort, infer TFilters>
    ? ListingParams<TSort[number], TFilters>
    : never

const CORE_PARAMS = new Set(["page", "pageSize", "q", "tri", "sens"])

function firstValue(raw: RawSearchParams, key: string): string | undefined {
  const value = raw[key]
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

function assertDescriptor<
  TSortColumns extends readonly string[],
  TFilters extends readonly AdminListingFilter[],
>(descriptor: AdminListingDescriptor<TSortColumns, TFilters>): void {
  const { path, sortColumns, defaultSort, defaultPageSize, filters } =
    descriptor

  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new Error("AdminListing: invalid path")
  }
  if (
    sortColumns.length === 0 ||
    new Set(sortColumns).size !== sortColumns.length
  ) {
    throw new Error("AdminListing: sortColumns must be non-empty and unique")
  }
  if (!(sortColumns as readonly string[]).includes(defaultSort)) {
    throw new Error("AdminListing: defaultSort must be a sortColumn")
  }
  if (!(PAGE_SIZES as readonly number[]).includes(defaultPageSize)) {
    throw new Error("AdminListing: invalid defaultPageSize")
  }

  const params = new Set<string>()
  const columnIds = new Set<string>()
  const keys = new Set<string>()
  for (const filter of filters) {
    const param = filter.param ?? filter.key
    const columnId = filter.columnId ?? param
    if (
      keys.has(filter.key) ||
      params.has(param) ||
      CORE_PARAMS.has(param) ||
      columnIds.has(columnId)
    ) {
      throw new Error("AdminListing: duplicate or reserved filter identifier")
    }
    keys.add(filter.key)
    params.add(param)
    columnIds.add(columnId)

    if (filter.kind === "multi-enum" || filter.kind === "single-enum") {
      if (
        filter.values.length === 0 ||
        new Set(filter.values).size !== filter.values.length ||
        filter.values.some((value) => value.length === 0)
      ) {
        throw new Error("AdminListing: invalid enum values")
      }
    }
    if (
      filter.kind === "multi-enum" &&
      filter.values.some((value) => value.includes(","))
    ) {
      throw new Error("AdminListing: multi-enum values cannot contain commas")
    }
  }
}

function resolveFilters(
  filters: readonly AdminListingFilter[]
): readonly ListingFilterMetadata[] {
  return Object.freeze(
    filters.map((filter) => {
      const param = filter.param ?? filter.key
      const values =
        filter.kind === "multi-enum" || filter.kind === "single-enum"
          ? filter.values
          : []
      return Object.freeze({
        key: filter.key,
        kind: filter.kind,
        param,
        columnId: filter.columnId ?? param,
        values: Object.freeze([...values]),
        allowed: Object.freeze(new Set(values)),
      })
    })
  )
}

export function defineAdminListing<
  TSortColumns extends readonly string[],
  TFilters extends readonly AdminListingFilter[],
>(
  descriptor: AdminListingDescriptor<TSortColumns, TFilters>
): CompiledAdminListing<TSortColumns, TFilters> {
  assertDescriptor(descriptor)

  const sortColumns = Object.freeze([...descriptor.sortColumns]) as TSortColumns
  const sortSet: ReadonlySet<string> = new Set(sortColumns)
  const filters = resolveFilters(descriptor.filters)
  const defaults = Object.freeze({
    tri: descriptor.defaultSort,
    sens: descriptor.defaultSens ?? "desc",
    pageSize: descriptor.defaultPageSize,
    page: 1,
  })

  function parse(raw: RawSearchParams) {
    const result: Record<string, unknown> = {}
    const pageRaw = Number(firstValue(raw, "page"))
    result.page =
      Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : defaults.page
    const pageSizeRaw = Number(firstValue(raw, "pageSize"))
    result.pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
      ? pageSizeRaw
      : defaults.pageSize
    const q = firstValue(raw, "q")?.trim()
    if (q) result.q = q
    const tri = firstValue(raw, "tri")
    result.tri = tri !== undefined && sortSet.has(tri) ? tri : defaults.tri
    const sens = firstValue(raw, "sens")
    result.sens = sens === "asc" || sens === "desc" ? sens : defaults.sens

    for (const filter of filters) {
      const value = firstValue(raw, filter.param)
      if (filter.kind === "multi-enum") {
        const values = [
          ...new Set(
            (value ?? "")
              .split(",")
              .map((token) => token.trim())
              .filter((token) => filter.allowed.has(token))
          ),
        ]
        if (values.length > 0) result[filter.key] = values
      } else if (filter.kind === "single-enum") {
        if (value !== undefined && filter.allowed.has(value)) {
          result[filter.key] = value
        }
      } else if (filter.kind === "single-token") {
        const token = value?.trim()
        if (token) result[filter.key] = token
      } else if (value === "1") {
        result[filter.key] = true
      }
    }

    return result as ListingParams<TSortColumns[number], TFilters>
  }

  function buildUrl(view: ListingParams<TSortColumns[number], TFilters>) {
    const raw = view as Record<string, unknown>
    const pageRaw = raw.page
    const page =
      typeof pageRaw === "number" && Number.isInteger(pageRaw) && pageRaw >= 1
        ? pageRaw
        : defaults.page
    const pageSizeRaw = raw.pageSize
    const pageSize =
      typeof pageSizeRaw === "number" &&
      (PAGE_SIZES as readonly number[]).includes(pageSizeRaw)
        ? pageSizeRaw
        : defaults.pageSize
    const qRaw = raw.q
    const q = typeof qRaw === "string" ? qRaw.trim() : ""

    const searchParams = new URLSearchParams()
    if (page > 1) searchParams.set("page", String(page))
    if (pageSize !== defaults.pageSize) {
      searchParams.set("pageSize", String(pageSize))
    }
    if (q) searchParams.set("q", q)

    for (const filter of filters) {
      const value = raw[filter.key]
      if (filter.kind === "multi-enum") {
        if (Array.isArray(value)) {
          const values = [
            ...new Set(
              value.filter(
                (token): token is string =>
                  typeof token === "string" && filter.allowed.has(token)
              )
            ),
          ]
          if (values.length > 0) {
            searchParams.set(filter.param, values.join(","))
          }
        }
      } else if (filter.kind === "single-enum") {
        if (typeof value === "string" && filter.allowed.has(value)) {
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

    const triRaw = raw.tri
    const tri =
      typeof triRaw === "string" && sortSet.has(triRaw) ? triRaw : defaults.tri
    const sens =
      raw.sens === "asc" || raw.sens === "desc" ? raw.sens : defaults.sens
    if (tri !== defaults.tri) searchParams.set("tri", tri)
    if (sens !== defaults.sens) searchParams.set("sens", sens)

    const query = searchParams.toString()
    return query ? `${descriptor.path}?${query}` : descriptor.path
  }

  return Object.freeze({
    path: descriptor.path,
    sortColumns,
    defaults,
    filters,
    parse,
    buildUrl,
  })
}
