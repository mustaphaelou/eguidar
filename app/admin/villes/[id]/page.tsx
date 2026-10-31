import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/layout/admin/page-header"
import { CityForm } from "@/components/admin/city-form"
import { Button } from "@/components/ui/button"
import { listAdminCities } from "@/lib/use-cases/livraison"
import { updateCityAction } from "@/app/admin/villes/actions"

export default async function EditCityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const city = await listAdminCities().then((cities) =>
    cities.find((candidate) => candidate.id === id)
  )
  if (!city) notFound()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Modifier — ${city.name}`}
        description="Le nom de la ville et le frais de livraison appliqué au panier."
        actions={
          <Button variant="outline" render={<Link href="/admin/villes" />}>
            Retour aux villes
          </Button>
        }
      />
      <CityForm city={city} action={updateCityAction} />
    </div>
  )
}
