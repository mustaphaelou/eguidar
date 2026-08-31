"use client"

import { type Column } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
  EyeOffIcon,
} from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>
  title: string
  className?: string
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <span className={cn("font-medium whitespace-nowrap", className)}>
        {title}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="-ms-1 h-8">
            <span>{title}</span>
            {column.getIsSorted() === "desc" ? (
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                strokeWidth={2}
                className="size-3.5 text-muted-foreground"
              />
            ) : column.getIsSorted() === "asc" ? (
              <HugeiconsIcon
                icon={ArrowUp01Icon}
                strokeWidth={2}
                className="size-3.5 text-muted-foreground"
              />
            ) : (
              <HugeiconsIcon
                icon={ArrowUpDownIcon}
                strokeWidth={2}
                className="size-3.5 text-muted-foreground"
              />
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-32">
        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
          Croissant
          <HugeiconsIcon
            icon={ArrowUp01Icon}
            strokeWidth={2}
            className="ms-auto size-3.5 text-muted-foreground"
          />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          Décroissant
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className="ms-auto size-3.5 text-muted-foreground"
          />
        </DropdownMenuItem>
        {column.getCanHide() && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              Masquer la colonne
              <HugeiconsIcon
                icon={EyeOffIcon}
                strokeWidth={2}
                className="ms-auto size-3.5 text-muted-foreground"
              />
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { DataTableColumnHeader, type DataTableColumnHeaderProps }
