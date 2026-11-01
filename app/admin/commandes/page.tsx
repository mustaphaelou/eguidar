import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/admin/page-header"
import {
  CommandesSkeleton,
  CommandesTable,
} from "@/app/admin/commandes/commandes-table"
import { parseCommandeListingParams } from "@/lib/commande-listing"
import { listAdminOrders } from "@/lib/use-cases/orders"

export const metadata: Metadata = {
  title: "Commandes",
}

type RawSearchParams = Record<string, string | string[] | undefined>

export default function AdminCommandesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Commandes"
        description="Suivez les commandes, leur paiement et leur livraison."
      />
      <Suspense fallback={<CommandesSkeleton />}>
        <CommandesContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  )
}

async function CommandesContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<RawSearchParams>
}) {
  const raw = await searchParamsPromise
  const params = parseCommandeListingParams(raw)
  const ordersPage = await listAdminOrders(params)

  return <CommandesTable params={params} page={ordersPage} />
}
