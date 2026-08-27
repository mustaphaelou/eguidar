"use client"

import { type Table } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DataTableFacetedFilter,
  type DataTableFacetedFilterOption,
} from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"

export type DataTableToolbarFilter = {
  columnId: string
  title: string
  options: DataTableFacetedFilterOption[]
}

type DataTableToolbarProps<TData> = {
  table: Table<TData>
  searchPlaceholder?: string
  filters?: DataTableToolbarFilter[]
  className?: string
}

function DataTableToolbar<TData>({
  table,
  searchPlaceholder = "Filtrer…",
  filters = [],
  className,
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.getState().columnFilters.length > 0 ||
    !!table.getState().globalFilter

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2.5",
        className
      )}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2.5">
        <Input
          placeholder={searchPlaceholder}
          value={(table.getState().globalFilter ?? "") as string}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          className="h-8 w-full max-w-64 md:w-40 lg:w-64"
        />
        {filters.map((filter) => {
          const column = table.getColumn(filter.columnId)
          if (!column) return null
          return (
            <DataTableFacetedFilter
              key={filter.columnId}
              column={column}
              title={filter.title}
              options={filter.options}
            />
          )
        })}
        {isFiltered && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              table.resetColumnFilters()
              table.setGlobalFilter("")
            }}
          >
            Réinitialiser
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="text-muted-foreground"
            />
          </Button>
        )}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  )
}

export { DataTableToolbar, type DataTableToolbarProps }