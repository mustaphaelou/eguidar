"use client"

import { cn } from "@/lib/utils"

export interface DataTableStatusLabels {
  singulier: string
  pluriel: string
  feminin?: boolean
}

export const ETIQUETTES_STATUT_PAR_DEFAUT: DataTableStatusLabels = {
  singulier: "résultat",
  pluriel: "résultats",
}

export interface DataTableStatusProps {
  resultCount: number
  selectedCount?: number
  labels?: DataTableStatusLabels
  className?: string
}

function accorder(nombre: number, labels: DataTableStatusLabels): string {
  return `${nombre} ${nombre > 1 ? labels.pluriel : labels.singulier}`
}

function phraseDeSelection(
  nombre: number,
  labels: DataTableStatusLabels
): string {
  const accord = labels.feminin ? "e" : ""
  const pluriel = nombre > 1 ? "s" : ""
  return `${accorder(nombre, labels)} sélectionné${accord}${pluriel}`
}

export function DataTableStatus({
  resultCount,
  selectedCount = 0,
  labels = ETIQUETTES_STATUT_PAR_DEFAUT,
  className,
}: DataTableStatusProps) {
  const annonce =
    selectedCount > 0
      ? `${accorder(resultCount, labels)}, ${phraseDeSelection(selectedCount, labels)}`
      : accorder(resultCount, labels)

  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn("sr-only", className)}
    >
      {annonce}
    </p>
  )
}
