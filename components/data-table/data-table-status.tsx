"use client"

import { cn } from "@/lib/utils"

export interface DataTableStatusLabels {
  /** Le nom du résultat au singulier, par exemple « commande ». */
  singulier: string
  /** Le nom du résultat au pluriel, par exemple « commandes ». */
  pluriel: string
  /** Accorde l'adjectif de sélection au féminin, comme « sélectionnée ». */
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

/**
 * La seule région polie de la grille : elle annonce le nombre de résultats et,
 * quand il y en a, la sélection. Les appelants passent des comptes — jamais une
 * phrase — pour que la Liste des Commandes et la Liste des Produits partagent
 * l'accord et le ton.
 */
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
