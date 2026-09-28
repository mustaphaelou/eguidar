"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
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
  DATE_COLUMN_ID,
  STATUT_COLUMN_ID,
  TOTAL_COLUMN_ID,
  type CommandeListingParams,
} from "@/lib/commande-listing"
import { formatPrice } from "@/lib/money"
import { ORDER_STATUS_LABELS, STATUTS_VALIDES } from "@/lib/statut-de-commande"
import { shortOrderId } from "@/lib/utils"
import type { AdminOrdersPage, AdminOrderSummary } from "@/lib/use-cases/orders"

import { useCommandeListing } from "./use-commande-listing"

const CLIENT_COLUMN_ID = "Client"
const ARTICLES_COLUMN_ID = "Articles"
const ACTIONS_COLUMN_ID = "actions"

const STATUS_FILTER_OPTIONS: DataTableFacetedFilterOption[] =
  STATUTS_VALIDES.map((value) => ({ value, label: ORDER_STATUS_LABELS[value] }))

const dateFormatter = new Intl.DateTimeFormat("fr-MA", { dateStyle: "medium" })

const columns: ColumnDef<AdminOrderSummary>[] = [
  {
    id: DATE_COLUMN_ID,
    accessorFn: (row) => row.createdAt.getTime(),
    meta: { label: "Commande" },
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
    meta: { label: "Statut" },
    header: "Statut",
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
  },
  {
    id: TOTAL_COLUMN_ID,
    accessorFn: (row) => row.totalPayable,
    meta: { label: "Total à payer" },
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

export function CommandesTable({
  params,
  page,
}: {
  params: CommandeListingParams
  page: AdminOrdersPage
}) {
  const router = useRouter()
  const {
    view,
    queryDraft,
    onQueryChange,
    onSortingChange,
    onColumnFiltersChange,
    onPaginationChange,
    reset,
  } = useCommandeListing({
    params,
    pageCount: page.pageCount,
    navigation: {
      replace: (href: string) => router.replace(href, { scroll: false }),
    },
  })

  const table = useReactTable({
    data: page.orders,
    columns,
    pageCount: page.pageCount,
    state: {
      sorting: [{ id: view.tri, desc: view.sens === "desc" }],
      pagination: { pageIndex: view.pageIndex, pageSize: view.pageSize },
      columnFilters:
        view.statuses.length > 0
          ? [{ id: STATUT_COLUMN_ID, value: [...view.statuses] }]
          : [],
      globalFilter: queryDraft,
    },
    onSortingChange,
    onPaginationChange,
    onColumnFiltersChange,
    onGlobalFilterChange: onQueryChange,
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
            <Button variant="outline" className="mt-4" onClick={reset}>
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
