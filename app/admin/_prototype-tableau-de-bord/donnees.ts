/**
 * PROTOTYPE (#964) — la matière des variantes. Les douze mois et les deux
 * Commandes viennent de la base de développement ; les fenêtres de 30 et de
 * 90 jours sont synthétiques (la base ne porte pas assez de Commandes pour
 * dessiner trente barres), et le scénario « boutique active » invente cinq
 * Commandes pour voir la liste pleine. Aucune donnée n'est écrite.
 */
import type {
  DashboardStats,
  LowStockVariant,
  RecentOrder,
} from "@/lib/use-cases/admin-dashboard"

import type { Alertes, Commandes, Montants, Periode } from "./reglages"

export interface PointDeChiffreAffaires {
  label: string
  revenue: number
}

export interface CompteursDAlerte {
  enRupture: number
  stockFaible: number
  sansAlt: number
  echecs: number
}

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" })
const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
})

function frenchMonthLabel(key: string): string {
  const [year, month] = key.split("-")
  return monthFormatter.format(new Date(Number(year), Number(month) - 1, 1))
}

function joursAvant(jours: number): Date {
  const maintenant = new Date()
  return new Date(
    maintenant.getFullYear(),
    maintenant.getMonth(),
    maintenant.getDate() - jours,
    12
  )
}

/** Une forme de série stable, pour que deux captures se comparent. */
const POIDS_30J = [
  0, 0, 0, 2, 0, 0, 0, 5, 0, 0, 1, 0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 0, 6, 0, 0,
  2, 0, 0, 1,
]

const POIDS_90J = [2, 1, 3, 0, 4, 2, 5, 3, 6, 4, 7, 5, 9]

function serieSurDesPoids(
  poids: number[],
  total: number,
  labelDe: (index: number, longueur: number) => string
): PointDeChiffreAffaires[] {
  const somme = poids.reduce((acc, valeur) => acc + valeur, 0)
  return poids.map((valeur, index) => ({
    label: labelDe(index, poids.length),
    revenue:
      somme === 0 || total === 0 ? 0 : Math.round((total * valeur) / somme),
  }))
}

export function serieDeChiffreAffaires(
  stats: DashboardStats,
  periode: Periode
): PointDeChiffreAffaires[] {
  if (periode === "12mois") {
    return stats.revenueByMonth.map((bucket) => ({
      label: frenchMonthLabel(bucket.month),
      revenue: bucket.revenue,
    }))
  }

  if (periode === "90j") {
    return serieSurDesPoids(
      POIDS_90J,
      Math.round(stats.caEncaisse30j * 2.4),
      (index, longueur) => {
        const semainesAvant = longueur - 1 - index
        return dayFormatter.format(new Date(joursAvant(semainesAvant * 7)))
      }
    )
  }

  return serieSurDesPoids(POIDS_30J, stats.caEncaisse30j, (index, longueur) => {
    const jours = longueur - 1 - index
    return dayFormatter.format(joursAvant(jours))
  })
}

export function montantAffiche(
  stats: DashboardStats,
  montants: Montants
): number {
  if (montants === "cinq") return 9_999_900
  if (montants === "six") return 99_999_900
  return stats.caEncaisse30j
}

const COMMANDES_ACTIVES: RecentOrder[] = [
  {
    id: "cm964a1x",
    status: "pending",
    total: 349_900,
    totalPayable: 349_900,
    createdAt: joursAvant(0),
    itemCount: 1,
  },
  {
    id: "cm964b2y",
    status: "delivered",
    total: 1_599_800,
    totalPayable: 1_599_800,
    createdAt: joursAvant(1),
    itemCount: 2,
  },
  {
    id: "cm964c3z",
    status: "confirmed",
    total: 899_900,
    totalPayable: 899_900,
    createdAt: joursAvant(2),
    itemCount: 1,
  },
  {
    id: "cm964d4w",
    status: "shipped",
    total: 2_450_000,
    totalPayable: 2_450_000,
    createdAt: joursAvant(3),
    itemCount: 3,
  },
  {
    id: "cm964e5v",
    status: "pending",
    total: 459_900,
    totalPayable: 459_900,
    createdAt: joursAvant(4),
    itemCount: 2,
  },
]

export interface CommandesAffichees {
  liste: RecentOrder[]
  total: number
}

export function commandesAffichees(
  stats: DashboardStats,
  commandes: Commandes
): CommandesAffichees {
  if (commandes === "actif") {
    return { liste: COMMANDES_ACTIVES, total: 24 }
  }
  return { liste: stats.recentOrders, total: stats.orderCount }
}

export function compteursDAlerte(
  stats: DashboardStats,
  sansAlt: number,
  echecs: number,
  alertes: Alertes
): CompteursDAlerte {
  if (alertes === "calme") {
    return { enRupture: 0, stockFaible: 0, sansAlt: 0, echecs: 0 }
  }
  return {
    enRupture: stats.outOfStockCount,
    stockFaible: stats.lowStockVariants.length,
    sansAlt,
    echecs,
  }
}

export function stockFaibleAffiche(
  stats: DashboardStats,
  alertes: Alertes
): LowStockVariant[] {
  return alertes === "calme" ? [] : stats.lowStockVariants
}

export function alertesVides(compteurs: CompteursDAlerte): boolean {
  return (
    compteurs.enRupture +
      compteurs.stockFaible +
      compteurs.sansAlt +
      compteurs.echecs ===
    0
  )
}
