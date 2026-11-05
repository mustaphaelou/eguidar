import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `tailwind-merge` lit `text-body` comme une couleur : `--text-body` est un token
 * maison de taille, et la fusion supprimait donc le `text-primary-foreground` du
 * Bouton qui le portait (rapport PageSpeed du 2026-11-05, §6.1). Les trois tailles
 * du thème sont déclarées ensemble pour qu'une sœur ne rouvre pas le défaut.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["body", "titre-carte", "titre-catalogue"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getPageNumbers(currentPage: number, totalPages: number) {
  const maxVisiblePages = 5
  const rangeWithDots: (number | "...")[] = []

  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      rangeWithDots.push(i)
    }
  } else {
    rangeWithDots.push(1)

    if (currentPage <= 3) {
      for (let i = 2; i <= 4; i++) {
        rangeWithDots.push(i)
      }
      rangeWithDots.push("...", totalPages)
    } else if (currentPage >= totalPages - 2) {
      rangeWithDots.push("...")
      for (let i = totalPages - 3; i <= totalPages; i++) {
        rangeWithDots.push(i)
      }
    } else {
      rangeWithDots.push("...")
      for (let i = currentPage - 1; i <= currentPage + 1; i++) {
        rangeWithDots.push(i)
      }
      rangeWithDots.push("...", totalPages)
    }
  }

  return rangeWithDots
}

export function getDisplayNameInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  const first = parts[0][0] ?? ""
  const last = parts[parts.length - 1]?.[0] ?? ""
  return (first + last).toUpperCase()
}

export function shortOrderId(orderId: string): string {
  return `#${orderId.slice(0, 8).toUpperCase()}`
}
