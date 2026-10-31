import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/admin/page-header"
import { CityForm } from "@/components/admin/city-form"
import { Button } from "@/components/ui/button"
import { createCityAction } from "@/app/admin/villes/actions"

export const metadata: Metadata = {
  title: "Nouvelle ville",
}

export default async function NewCityPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nouvelle ville"
        description="Ajoutez une ville desservie et le frais de livraison appliqué."
        actions={
          <Button variant="outline" render={<Link href="/admin/villes" />}>
            Retour aux villes
          </Button>
        }
      />
      <CityForm action={createCityAction} />
    </div>
  )
}
