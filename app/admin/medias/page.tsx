import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/layout/admin/page-header"
import { MediasBibliotheque } from "@/components/admin/medias-bibliotheque"
import { Skeleton } from "@/components/ui/skeleton"
import { parseMediasListingParams } from "@/lib/medias-listing"
import { listerImagesProduit } from "@/lib/use-cases/images-produit"
import {
  mettreAJourAltImageAction,
  reconcilierImagesAction,
  supprimerImagesAction,
} from "@/app/admin/medias/actions"

export const metadata: Metadata = {
  title: "Médias",
}

type RawSearchParams = Record<string, string | string[] | undefined>

function MediasSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_valeur, index) => (
        <Skeleton key={index} className="h-56 rounded-xl" />
      ))}
    </div>
  )
}

export default function AdminMediasPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Médias"
        description="Les images produit du catalogue, leur texte alternatif et leurs usages."
      />
      <Suspense fallback={<MediasSkeleton />}>
        <MediasContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  )
}

async function MediasContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<RawSearchParams>
}) {
  const params = parseMediasListingParams(await searchParamsPromise)
  const page = await listerImagesProduit(params)
  return (
    <MediasBibliotheque
      params={params}
      page={page}
      supprimerImages={supprimerImagesAction}
      mettreAJourAlt={mettreAJourAltImageAction}
      reconcilier={reconcilierImagesAction}
    />
  )
}
