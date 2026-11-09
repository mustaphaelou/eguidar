import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"

import { CarteChiffreAffaires } from "@/components/admin/chiffre-affaires"
import { CarteIndicateurs } from "@/components/admin/carte-indicateurs"
import { CarteSurveillance } from "@/components/admin/carte-surveillance"
import { CommandesRecentes } from "@/components/admin/commandes-recentes"
import { PremierePage } from "@/components/admin/premiere-page"
import { TableauDeBordChargement } from "@/components/admin/tableau-de-bord-chargement"
import { PageHeader } from "@/components/layout/admin/page-header"
import { Button } from "@/components/ui/button"
import { compterExecutionsEnEchec } from "@/lib/automations/historique"
import { parsePeriode } from "@/lib/tableau-de-bord-periode"
import { getDashboardStats } from "@/lib/use-cases/admin-dashboard"
import { listerImagesProduit } from "@/lib/use-cases/images-produit"

export const metadata: Metadata = {
  title: "Tableau de bord",
}

type RawSearchParams = Record<string, string | string[] | undefined>

export default function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <Suspense fallback={<TableauDeBordChargement />}>
      <TableauDeBord searchParams={searchParams} />
    </Suspense>
  )
}

async function TableauDeBord({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const periode = parsePeriode(await searchParams)
  const [stats, imagesSansAlt, executionsEnEchec] = await Promise.all([
    getDashboardStats(periode),
    listerImagesProduit({ sansAlt: true }),
    compterExecutionsEnEchec(),
  ])

  // 0 Produit et 0 Commande : la page entière cède la place à l'invitation.
  // Une boutique qui garde une histoire (des Commandes) garde son Tableau de bord.
  if (stats.productCount === 0 && stats.orderCount === 0) {
    return <PremierePage />
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description="Les chiffres de la boutique, les Commandes à traiter et les points de vigilance."
        actions={
          <Button render={<Link href="/admin/produits/nouveau" />}>
            Nouveau produit
          </Button>
        }
      />

      <CarteIndicateurs stats={stats} />

      <div className="grid gap-4 lg:grid-cols-7">
        <CarteChiffreAffaires
          data={stats.chiffreAffairesEncaisse}
          periode={periode}
          className="lg:col-span-4"
        />
        <CommandesRecentes
          commandes={stats.recentOrders}
          total={stats.orderCount}
          className="lg:col-span-3"
        />
      </div>

      <CarteSurveillance
        compteurs={{
          enRupture: stats.outOfStockCount,
          sansAlt: imagesSansAlt.sansAltCount,
          echecs: executionsEnEchec,
        }}
        stock={stats.lowStockVariants}
      />
    </div>
  )
}
