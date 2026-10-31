"use client"

import { type RowData, type Table } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { SlidersHorizontalIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    /** Classes appliquées à l'en-tête et aux cellules, par exemple pour masquer une colonne sur mobile. */
    className?: string
  }
}

type DataTableViewOptionsProps<TData> = {
  table: Table<TData>
}

function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="max-sm:h-9">
            Affichage
            <HugeiconsIcon
              icon={SlidersHorizontalIcon}
              strokeWidth={2}
              className="text-muted-foreground"
            />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Afficher les colonnes</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {column.columnDef.meta?.label ?? column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { DataTableViewOptions, type DataTableViewOptionsProps }
