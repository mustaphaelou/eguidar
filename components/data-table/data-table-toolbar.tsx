"use client"

import { useId } from "react"
import { type Table } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DataTableFacetedFilter,
  type DataTableFacetedFilterOption,
} from "./data-table-faceted-filter"
import {
  DataTableStatus,
  type DataTableStatusLabels,
} from "./data-table-status"
import { DataTableViewOptions } from "./data-table-view-options"

export type DataTableToolbarFilter = {
  columnId: string
  title: string
  options: DataTableFacetedFilterOption[]
}

export type DataTableToolbarProps<TData> = {
  table: Table<TData>
  searchPlaceholder?: string
  /** Le nom accessible du champ de recherche ; le placeholder ne suffit pas. */
  searchLabel?: string
  /** Le total de la vue, toutes pages confondues — jamais la page courante. */
  resultCount?: number
  /** Force le compte de sélection quand il ne vient pas de `rowSelection`. */
  selectedCount?: number
  statusLabels?: DataTableStatusLabels
  filters?: DataTableToolbarFilter[]
  className?: string
}

function DataTableToolbar<TData>({
  table,
  searchPlaceholder = "Filtrer…",
  searchLabel = "Rechercher dans la liste",
  resultCount,
  selectedCount,
  statusLabels,
  filters = [],
  className,
}: DataTableToolbarProps<TData>) {
  const idRecherche = useId()
  const isFiltered =
    table.getState().columnFilters.length > 0 || !!table.getState().globalFilter
  const nombreSelectionne =
    selectedCount ?? Object.keys(table.getState().rowSelection ?? {}).length

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2.5",
        className
      )}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2.5">
        <Label htmlFor={idRecherche} className="sr-only">
          {searchLabel}
        </Label>
        <Input
          id={idRecherche}
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
      {resultCount !== undefined ? (
        <DataTableStatus
          resultCount={resultCount}
          selectedCount={nombreSelectionne}
          labels={statusLabels}
        />
      ) : null}
    </div>
  )
}

export { DataTableToolbar }
