import {
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table"

export type DataTableColumnMeta = {
  label?: string
  /** Classes appliquées à l'en-tête et aux cellules, par exemple pour masquer une colonne sur mobile. */
  className?: string
}

/**
 * Les capacités que les composants de la grille supposent. TanStack Table v9
 * n'ajoute une API que si sa fonctionnalité est déclarée ; cette liste est donc
 * la surface commune du catalogue Produits et de la liste des Commandes, qui
 * font tous deux le tri, le filtrage et la pagination côté serveur.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  columnMeta: metaHelper<DataTableColumnMeta>(),
})

export type DataTableFeatures = typeof dataTableFeatures
