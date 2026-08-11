import type { Metadata } from "next"

import { CityForm } from "@/components/admin/city-form"
import { createCityAction } from "@/app/admin/villes/actions"

export const metadata: Metadata = {
  title: "Nouvelle ville",
}

export default async function NewCityPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nouvelle ville</h1>
      <CityForm action={createCityAction} />
    </div>
  )
}
