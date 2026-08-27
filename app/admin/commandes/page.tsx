import { Suspense } from "react"
import type { Metadata } from "next"

import { CommandesSkeleton, CommandesTable } from "@/app/admin/commandes/commandes-table"
import { listAdminOrders, parseAdminOrdersSearchParams } from "@/lib/use-cases/admin-orders"

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
      <h1 className="text-2xl font-semibold">Commandes</h1>
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
  const params = parseAdminOrdersSearchParams(raw)
  const ordersPage = await listAdminOrders(params)

  return <CommandesTable params={params} page={ordersPage} />
}