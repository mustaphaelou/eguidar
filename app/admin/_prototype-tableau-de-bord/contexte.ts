import type {
  LowStockVariant,
  RecentOrder,
} from "@/lib/use-cases/admin-dashboard"

import type { CompteursDAlerte, PointDeChiffreAffaires } from "./donnees"
import type { Reglages } from "./reglages"

/**
 * PROTOTYPE (#964) — tout ce que les trois variantes partagent : la matière et
 * les réglages. Les variantes ne diffèrent que par la disposition.
 */
export interface ContextePrototype {
  reglages: Reglages
  stats: import("@/lib/use-cases/admin-dashboard").DashboardStats
  montantDuChiffreAffaires: number
  serie: PointDeChiffreAffaires[]
  commandes: RecentOrder[]
  totalCommandes: number
  compteurs: CompteursDAlerte
  stockFaible: LowStockVariant[]
}
