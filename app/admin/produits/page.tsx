import Link from "next/link"
import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/layout/admin/page-header"
import { Button } from "@/components/ui/button"
import { parseProduitListingParams } from "@/lib/produit-listing"
import {
  libelleSansStructure,
  listAdminProducts,
} from "@/lib/use-cases/admin-catalog"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import {
  bulkDeleteAction,
  bulkSetFeaturedAction,
  bulkSetFreeShippingAction,
  bulkSetStructureAction,
  duplicateProductAction,
} from "@/app/admin/produits/actions"
import { ProduitsSkeleton, ProduitsTable } from "./produits-table"

export const metadata: Metadata = {
  title: "Produits",
}

type RawSearchParams = Record<string, string | string[] | undefined>

export default function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Produits"
        description="Le catalogue, ses prix, son stock et ses mises en avant."
        actions={
          <Button render={<Link href="/admin/produits/nouveau" />}>
            Nouveau produit
          </Button>
        }
      />

      <Suspense fallback={<ProduitsSkeleton />}>
        <ProduitsContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  )
}

async function ProduitsContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<RawSearchParams>
}) {
  const raw = await searchParamsPromise
  const params = parseProduitListingParams(raw)
  const [page, lecture] = await Promise.all([
    listAdminProducts(params),
    lireStructure(),
  ])
  const structures = lecture.options().map((option) => ({
    id: option.id,
    chemin: lecture
      .filAriane(option.id)
      .map((maillon) => maillon.name)
      .join(" › "),
  }))

  return (
    <ProduitsTable
      params={params}
      page={page}
      structures={structures}
      sansStructureLabel={libelleSansStructure()}
      actions={{
        setStructure: bulkSetStructureAction,
        setFeatured: bulkSetFeaturedAction,
        setFreeShipping: bulkSetFreeShippingAction,
        delete: bulkDeleteAction,
        duplicate: duplicateProductAction,
      }}
    />
  )
}
