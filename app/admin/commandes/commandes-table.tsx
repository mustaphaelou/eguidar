"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"

import {
  DataTablePagination,
  DataTableToolbar,
  type DataTableFacetedFilterOption,
} from "@/components/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { OrderStatusBadge } from "@/components/storefront/order-status-badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  hrefOf,
  reconcile,
  signatureOf,
  type CommandeListingParams,
  type CommandeListingView,
  viewFromParams,
} from "@/lib/commande-listing"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import { formatPrice } from "@/lib/money"
import { ORDER_STATUS_LABELS, STATUTS_VALIDES } from "@/lib/order-status"
import { PAGE_SIZES } from "@/lib/table-config"
import { shortOrderId } from "@/lib/utils"
import type {
  AdminOrdersPage,
  AdminOrderSummary,
} from "@/lib/use-cases/admin-orders"

const COMMANDE_COLUMN_ID = "Commande"
const CLIENT_COLUMN_ID = "Client"
const ARTICLES_COLUMN_ID = "Articles"
const STATUT_COLUMN_ID = "Statut"
const TOTAL_COLUMN_ID = "Total à payer"
const ACTIONS_COLUMN_ID = "actions"

const SEARCH_DEBOUNCE_MS = 300

const STATUS_FILTER_OPTIONS: DataTableFacetedFilterOption[] =
  STATUTS_VALIDES.map((value) => ({ value, label: ORDER_STATUS_LABELS[value] }))

const STATUS_FILTER_VALUES: string[] = STATUTS_VALIDES

const dateFormatter = new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium" })

const columns: ColumnDef<AdminOrderSummary>[] = [
  {
    id: COMMANDE_COLUMN_ID,
    accessorFn: (row) => row.createdAt.getTime(),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Commande" />
    ),
    cell: ({ row }) => (
      <div className="flex min-w-24 flex-col">
        <span className="font-medium">{shortOrderId(row.original.id)}</span>
        <span className="text-sm whitespace-nowrap text-muted-foreground">
          {dateFormatter.format(row.original.createdAt)}
        </span>
      </div>
    ),
  },
  {
    id: CLIENT_COLUMN_ID,
    accessorFn: (row) => row.customerName,
    enableSorting: false,
    header: CLIENT_COLUMN_ID,
    cell: ({ row }) => (
      <div className="flex max-w-56 min-w-0 flex-col">
        <span className="truncate">{row.original.customerName}</span>
        <span className="truncate text-sm text-muted-foreground">
          {row.original.customerEmail}
        </span>
      </div>
    ),
  },
  {
    id: ARTICLES_COLUMN_ID,
    accessorFn: (row) => row.itemCount,
    enableSorting: false,
    header: ARTICLES_COLUMN_ID,
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{row.original.itemCount}</span>
    ),
  },
  {
    id: STATUT_COLUMN_ID,
    accessorFn: (row) => row.status,
    enableSorting: false,
    header: STATUT_COLUMN_ID,
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
  },
  {
    id: TOTAL_COLUMN_ID,
    accessorFn: (row) => row.totalPayable,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total à payer" />
    ),
    cell: ({ row }) => (
      <span className="font-medium whitespace-nowrap">
        {formatPrice(row.original.totalPayable)}
      </span>
    ),
  },
  {
    id: ACTIONS_COLUMN_ID,
    header: () => (
      <div className="flex justify-end pe-1">
        <span className="font-medium whitespace-nowrap">Actions</span>
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button
          render={<Link href={`/admin/commandes/${row.original.id}`} />}
          variant="outline"
          size="sm"
        >
          Voir
        </Button>
      </div>
    ),
  },
]

const BLANK_VIEW_EXTRA = { tri: "date" as const, sens: "desc" as const }

export function CommandesTable({
  params,
  page,
}: {
  params: CommandeListingParams
  page: AdminOrdersPage
}) {
  const router = useRouter()
  const [view, setView] = React.useState<CommandeListingView>(() =>
    viewFromParams(params, page.pageCount)
  )
  const [queryDraft, setQueryDraft] = React.useState<string>(view.q)
  const intentRef = React.useRef<CommandeListingView>(view)
  const lastPushedRef = React.useRef<string>(signatureOf(view))
  const searchTimerRef = React.useRef<number | null>(null)

  const cancelPendingSearch = React.useCallback(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
  }, [])

  const commit = React.useCallback(
    (next: CommandeListingView, fromSearch = false) => {
      if (!fromSearch) cancelPendingSearch()
      lastPushedRef.current = signatureOf(next)
      setView(next)
      setQueryDraft(next.q)
      router.replace(hrefOf(next), { scroll: false })
    },
    [cancelPendingSearch, router]
  )

  React.useEffect(() => {
    const {
      echo,
      view: incoming,
      correctedHref,
    } = reconcile(params, page.pageCount, lastPushedRef.current)
    if (echo) return
    cancelPendingSearch()
    lastPushedRef.current = signatureOf(incoming)
    intentRef.current = incoming
    setView(incoming)
    setQueryDraft(incoming.q)
    if (correctedHref) {
      router.replace(correctedHref, { scroll: false })
    }
  }, [cancelPendingSearch, params, page.pageCount, router])

  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current)
      }
    }
  }, [])

  const handleGlobalFilterChange = (value: string) => {
    setQueryDraft(value)
    const q = value.trim()
    if (!q) {
      commit({ ...intentRef.current, q: "", pageIndex: 0 })
      return
    }
    intentRef.current = { ...intentRef.current, q, pageIndex: 0 }
    cancelPendingSearch()
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null
      commit(intentRef.current, true)
    }, SEARCH_DEBOUNCE_MS)
  }

  const resolveUpdater = <T,>(updater: Updater<T>, current: T): T =>
    typeof updater === "function"
      ? (updater as (old: T) => T)(current)
      : updater

  const pagination: PaginationState = {
    pageIndex: view.pageIndex,
    pageSize: view.pageSize,
  }

  const sorting: SortingState = [
    {
      id: view.tri === "total" ? TOTAL_COLUMN_ID : COMMANDE_COLUMN_ID,
      desc: view.sens === "desc",
    },
  ]

  const columnFilters: ColumnFiltersState =
    view.statuses.length > 0
      ? [{ id: STATUT_COLUMN_ID, value: [...view.statuses] }]
      : []

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const next = resolveUpdater(updater, pagination)
    if (next.pageSize !== view.pageSize) {
      commit({
        ...intentRef.current,
        pageSize: next.pageSize as (typeof PAGE_SIZES)[number],
        pageIndex: 0,
      })
      return
    }
    commit({ ...intentRef.current, pageIndex: next.pageIndex })
  }

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = resolveUpdater(updater, sorting)
    const first = next[0]
    commit({
      ...intentRef.current,
      tri: first?.id === TOTAL_COLUMN_ID ? "total" : "date",
      sens: first?.desc ? "desc" : "asc",
      pageIndex: 0,
    })
  }

  const handleColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = resolveUpdater(updater, columnFilters)
    const entry = next.find((filter) => filter.id === STATUT_COLUMN_ID)
    const statuses = Array.isArray(entry?.value)
      ? entry.value.filter((value): value is OrderStatus =>
          STATUS_FILTER_VALUES.includes(value as string)
        )
      : []
    commit({ ...intentRef.current, statuses, pageIndex: 0 })
  }

  const resetCriteria = () => {
    commit({
      ...intentRef.current,
      ...BLANK_VIEW_EXTRA,
      q: "",
      statuses: [],
      pageIndex: 0,
    })
  }

  const table = useReactTable({
    data: page.orders,
    columns,
    pageCount: page.pageCount,
    state: { sorting, pagination, columnFilters, globalFilter: queryDraft },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    onGlobalFilterChange: handleGlobalFilterChange,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    getCoreRowModel: getCoreRowModel(),
  })

  const hasActiveCriteria = view.q.trim().length > 0 || view.statuses.length > 0

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar
        table={table}
        searchPlaceholder="Rechercher par nom ou email…"
        filters={[
          {
            columnId: STATUT_COLUMN_ID,
            title: "Statut de commande",
            options: STATUS_FILTER_OPTIONS,
          },
        ]}
      />

      {page.orders.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="size-5 text-muted-foreground"
            />
          </div>
          <p className="text-sm font-medium">
            {hasActiveCriteria
              ? "Aucune commande ne correspond à ces critères."
              : "Aucune commande pour le moment."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveCriteria
              ? "Ajustez la recherche ou les filtres pour élargir la liste."
              : "Les nouvelles commandes apparaîtront ici."}
          </p>
          {hasActiveCriteria && (
            <Button variant="outline" className="mt-4" onClick={resetCriteria}>
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataTablePagination table={table} />
        </>
      )}
    </div>
  )
}

export function CommandesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-full max-w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
