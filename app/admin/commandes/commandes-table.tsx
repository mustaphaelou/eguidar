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
import { EmptyState } from "@/components/admin/empty-state"
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
    meta: { label: "Client", className: "hidden sm:table-cell" },
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
    meta: { label: "Articles", className: "hidden md:table-cell" },
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
        searchLabel="Rechercher une commande par nom ou email"
        searchPlaceholder="Rechercher par nom ou email…"
        resultCount={page.totalCount}
        statusLabels={{
          singulier: "commande",
          pluriel: "commandes",
          feminin: true,
        }}
        filters={[
          {
            columnId: STATUT_COLUMN_ID,
            title: "Statut de commande",
            options: STATUS_FILTER_OPTIONS,
          },
        ]}
      />

      {page.orders.length === 0 ? (
        <EmptyState
          icon={
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="size-5"
            />
          }
          title={
            hasActiveCriteria
              ? "Aucune commande ne correspond à ces critères."
              : "Aucune commande pour le moment."
          }
          description={
            hasActiveCriteria
              ? "Ajustez la recherche ou les filtres pour élargir la liste."
              : "Les nouvelles commandes apparaîtront ici, avec leur statut et leur montant."
          }
          action={
            hasActiveCriteria ? (
              <Button variant="outline" onClick={reset}>
                Réinitialiser les filtres
              </Button>
            ) : null
          }
          className="py-14"
        />
      ) : (
        <>
          <div className="flex flex-col divide-y overflow-clip rounded-xl border bg-card lg:hidden">
            {page.orders.map((order) => (
              <div key={order.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">
                      {shortOrderId(order.id)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {dateFormatter.format(order.createdAt)}
                    </span>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {order.customerName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {order.customerEmail}
                    </span>
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap tabular-nums">
                    {formatPrice(order.totalPayable)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {order.itemCount} article{order.itemCount > 1 ? "s" : ""}
                  </span>
                  <Button
                    render={<Link href={`/admin/commandes/${order.id}`} />}
                    variant="outline"
                    size="sm"
                  >
                    Voir la commande
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-clip rounded-xl border bg-card lg:block">
            <Table>
              <TableHeader className="bg-muted/40">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={header.column.columnDef.meta?.className}
                      >
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
                      <TableCell
                        key={cell.id}
                        className={cell.column.columnDef.meta?.className}
                      >
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
          </div>
          <DataTablePagination table={table} />
        </>
      )}
    </div>
  )
}

export function CommandesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="h-9 w-full max-w-64 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-40 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
