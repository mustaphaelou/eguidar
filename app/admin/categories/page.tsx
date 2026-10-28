import Link from "next/link"
import type { Metadata } from "next"

import { Button } from "@/components/ui/button"
import {
  TableauStructure,
  type CibleSuppressionVue,
} from "@/components/admin/tableau-structure"
import type { LigneStructureVue } from "@/components/admin/deplacement-structure"
import { intentionsDeDeplacement } from "@/app/admin/categories/intentions-de-deplacement"
import {
  deleteCategoryAction,
  deplacerStructureAction,
} from "@/app/admin/categories/actions"
import { lireStructure } from "@/lib/use-cases/lecture-structure"

export const metadata: Metadata = {
  title: "Catégories",
}

export default async function AdminCategoriesPage() {
  const lecture = await lireStructure()
  const lignes = lecture.lignesAdmin()
  const cibles = lecture.ciblesSuppression()
  const nomsStructures: Record<string, string> = Object.fromEntries(
    lignes.map((ligne) => [ligne.id, ligne.name])
  )
  const ciblesParStructure: Record<string, CibleSuppressionVue> =
    Object.fromEntries(cibles.map((cible) => [cible.id, cible]))
  const intentions = Object.fromEntries(intentionsDeDeplacement(lignes))
  const destinations = lignes.map((ligne) => ({
    id: ligne.id,
    libelle: ligne.chemin.map((maillon) => maillon.name).join(" / "),
  }))
  const lignesVue: LigneStructureVue[] = lignes

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catégories</h1>
        <Button render={<Link href="/admin/categories/nouveau" />}>
          Nouvelle catégorie
        </Button>
      </div>

      {lignesVue.length === 0 ? (
        <p className="text-muted-foreground">
          Aucune catégorie pour le moment. Créez votre première catégorie.
        </p>
      ) : (
        <TableauStructure
          lignes={lignesVue}
          intentions={intentions}
          destinations={destinations}
          cibles={ciblesParStructure}
          nomsStructures={nomsStructures}
          actionSuppression={deleteCategoryAction}
          actionDeplacement={deplacerStructureAction}
        />
      )}
    </div>
  )
}
