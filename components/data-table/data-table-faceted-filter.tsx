"use client"

import * as React from "react"
import { type Column } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { CirclePlusIcon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type DataTableFacetedFilterOption = {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

type DataTableFacetedFilterProps<TData, TValue> = {
  column?: Column<TData, TValue>
  title?: string
  options: DataTableFacetedFilterOption[]
}

function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const selectedValues = new Set(
    (column?.getFilterValue() as string[] | undefined) ?? []
  )
  const selectedOptions = options.filter((option) =>
    selectedValues.has(option.value)
  )
  const resumeSelection =
    selectedOptions.length === 0
      ? "aucune valeur sélectionnée"
      : `${selectedOptions.map((option) => option.label).join(", ")} sélectionné${selectedOptions.length > 1 ? "s" : ""}`

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="border-dashed max-sm:h-9"
            aria-label={`${title ?? "Filtre"} — ${resumeSelection}`}
          >
            <HugeiconsIcon
              icon={CirclePlusIcon}
              strokeWidth={2}
              className="text-muted-foreground"
            />
            {title}
            {selectedOptions.length > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="mx-0.5 h-4 w-px bg-border"
                />
                {(selectedOptions.length > 2
                  ? selectedOptions.slice(0, 2)
                  : selectedOptions
                ).map((option) => (
                  <Badge key={option.value} variant="secondary">
                    {option.label}
                  </Badge>
                ))}
                {selectedOptions.length > 2 && (
                  <Badge variant="secondary">
                    +{selectedOptions.length - 2}
                  </Badge>
                )}
              </>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-52 p-1">
        {options.map((option) => {
          const isSelected = selectedValues.has(option.value)
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                if (isSelected) {
                  selectedValues.delete(option.value)
                } else {
                  selectedValues.add(option.value)
                }
                const filterValues = Array.from(selectedValues)
                column?.setFilterValue(
                  filterValues.length ? filterValues : undefined
                )
              }}
              className="relative flex w-full cursor-default items-center gap-2 rounded-lg py-1.5 ps-8 pe-2 text-sm outline-hidden select-none hover:bg-accent focus-visible:bg-accent"
            >
              <span className="absolute inset-y-0 start-0 flex w-7 items-center justify-center">
                {isSelected && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                )}
              </span>
              {option.icon ? (
                <option.icon className="size-4 text-muted-foreground" />
              ) : null}
              {option.label}
            </button>
          )
        })}
        {selectedValues.size > 0 && (
          <>
            <div aria-hidden="true" className="-mx-1 my-1 h-px bg-border/50" />
            <button
              type="button"
              onClick={() => column?.setFilterValue(undefined)}
              className="flex w-full items-center justify-center rounded-lg py-1.5 text-sm outline-hidden select-none hover:bg-accent focus-visible:bg-accent"
            >
              Effacer les filtres
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { DataTableFacetedFilter, type DataTableFacetedFilterProps }
