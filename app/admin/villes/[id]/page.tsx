import { notFound } from "next/navigation"

import { CityForm } from "@/components/admin/city-form"
import { listAdminCities } from "@/lib/use-cases/admin-structure"
import { updateCityAction } from "@/app/admin/villes/actions"

export default async function EditCityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const city = await listAdminCities().then((cities) => cities.find((candidate) => candidate.id === id))
  if (!city) notFound()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Modifier — {city.name}</h1>
      <CityForm city={city} action={updateCityAction} />
    </div>
  )
}
