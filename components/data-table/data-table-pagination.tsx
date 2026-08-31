"use client"

import { type Table } from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeftDoubleIcon,
  ArrowRightDoubleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@hugeicons/core-free-icons"

import { PAGE_SIZES } from "@/lib/table-config"
import { cn, getPageNumbers } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type DataTablePaginationProps<TData> = {
  table: Table<TData>
  pageSizeOptions?: readonly number[]
  className?: string
}

function DataTablePagination<TData>({
  table,
  pageSizeOptions = PAGE_SIZES,
  className,
}: DataTablePaginationProps<TData>) {
  const currentPage = table.getState().pagination.pageIndex + 1
  const totalPages = table.getPageCount()
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div
      className={cn(
        "@container/content flex flex-wrap items-center justify-between gap-2 overflow-x-auto p-1",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <p className="hidden text-sm font-medium whitespace-nowrap @md/content:block">
          Lignes par page
        </p>
        <Select
          value={String(table.getState().pagination.pageSize)}
          onValueChange={(value) => table.setPageSize(Number(value))}
        >
          <SelectTrigger size="sm" className="w-16">
            <SelectValue placeholder={String(pageSizeOptions[0])} />
          </SelectTrigger>
          <SelectContent align="center" side="top">
            {pageSizeOptions.map((pageSize) => (
              <SelectItem key={pageSize} value={String(pageSize)}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm font-medium whitespace-nowrap @md/content:hidden">
          Page {currentPage} sur {totalPages}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Première page"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          <HugeiconsIcon icon={ArrowLeftDoubleIcon} strokeWidth={2} />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Précédent"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <HugeiconsIcon icon={ChevronLeftIcon} strokeWidth={2} />
        </Button>
        <div className="hidden items-center gap-0.5 @md/content:flex">
          {pageNumbers.map((pageNumber, index) =>
            pageNumber === "..." ? (
              <span
                key={`dots-${index}`}
                aria-hidden="true"
                className="flex size-8 items-center justify-center text-sm text-muted-foreground select-none"
              >
                …
              </span>
            ) : (
              <Button
                key={pageNumber}
                variant={pageNumber === currentPage ? "outline" : "ghost"}
                size="icon-sm"
                aria-label={`Page ${pageNumber}`}
                onClick={() => table.setPageIndex(pageNumber - 1)}
              >
                {pageNumber}
              </Button>
            )
          )}
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Suivant"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <HugeiconsIcon icon={ChevronRightIcon} strokeWidth={2} />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Dernière page"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          <HugeiconsIcon icon={ArrowRightDoubleIcon} strokeWidth={2} />
        </Button>
      </div>
    </div>
  )
}

export { DataTablePagination, type DataTablePaginationProps }
