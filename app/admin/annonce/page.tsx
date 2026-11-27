import { exigerAdmin } from "@/lib/use-cases/exiger-admin"
import type { Metadata } from "next"

import { updateAnnonceAction } from "@/app/admin/annonce/actions"
import { AnnonceForm } from "@/components/admin/annonce-form"
import { PageHeader } from "@/components/layout/admin/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getAnnonce } from "@/lib/use-cases/annonce"

export const metadata: Metadata = {
  title: "Annonce",
}

export default async function AdminAnnoncePage() {
  await exigerAdmin()
  const annonce = await getAnnonce()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Annonce"
        description="Le ruban d'information affiché sous le bandeau de navigation sur toute la boutique."
      />

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Ruban d&apos;Annonce</CardTitle>
          <CardDescription>
            {annonce?.actif
              ? "L'Annonce est actuellement visible sur la boutique."
              : "L'Annonce est actuellement masquée sur la boutique."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnnonceForm
            initialAnnonce={{
              actif: annonce?.actif ?? false,
              message: annonce?.message ?? "",
              lienUrl: annonce?.lienUrl ?? null,
              lienLibelle: annonce?.lienLibelle ?? null,
            }}
            action={updateAnnonceAction}
          />
        </CardContent>
      </Card>
    </div>
  )
}
