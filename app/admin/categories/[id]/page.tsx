import { notFound } from "next/navigation"

import { CategoryForm } from "@/components/admin/category-form"
import { lireEcranEdition } from "@/lib/use-cases/lecture-structure"
import { updateCategoryAction } from "@/app/admin/categories/actions"

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // **Une lecture, une marche, une ligne par cycle** — la promesse n'est plus
  // écrite ici mais tenue par le module : l'écran ne construit plus de marche
  // pour l'une de ses listes, et ne sait plus ce qu'est une descente (#564,
  // ADR-0030). Il reçoit ce qu'il rend — la Structure qu'il édite, les
  // candidates qu'il propose, et celles qu'il ne peut pas proposer.
  //
  // Les parentes exclues sont **la primitive**, telle qu'elle est : la Structure
  // elle-même et ses descendantes, puisque se suspendre sous l'une d'elles
  // refermerait un cycle. L'écran ne l'ajoute plus à la main, donc ce « elle-même
  // comprise » ne peut pas s'oublier en chemin. Et une seule porte répond aux
  // trois questions ci-dessus : les prendre une par une aurait relu la table et
  // rebâti une seconde marche, donc dit le cycle d'une Structure corrompue deux
  // fois au lieu d'une — ce qui est précisément le nombre de Structures à
  // réparer (#546).
  //
  // Le formulaire reste le dernier maître de cette liste : il reçoit des
  // identifiants et construit son propre `Set` (ADR-0028).
  const ecran = await lireEcranEdition(id)
  if (!ecran) notFound()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        Modifier — {ecran.structureEditee.name}
      </h1>
      <CategoryForm
        category={ecran.structureEditee}
        categories={ecran.candidates}
        excludedParentIds={ecran.parentesExclues}
        action={updateCategoryAction}
      />
    </div>
  )
}
