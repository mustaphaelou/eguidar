import { notFound } from "next/navigation"

import {
  CategoryForm,
  type CategoryFormInitial,
} from "@/components/admin/category-form"
import { marcheDesStructures } from "@/lib/marche-structure"
import { listAdminCategoriesWithCounts } from "@/lib/use-cases/admin-structure"
import { updateCategoryAction } from "@/app/admin/categories/actions"

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const categories = await listAdminCategoriesWithCounts()
  const category = categories.find((candidate) => candidate.id === id)
  if (!category) notFound()

  const initial: CategoryFormInitial = {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    image: category.image,
  }

  // Les parentes qu'un éditeur ne peut pas choisir : la Structure et ses
  // descendantes, puisque se suspendre sous l'une d'elles refermerait un
  // cycle. La marche les rend d'un coup — elle inclut la Structure qu'on lui
  // nomme, là où l'écran devait l'ajouter à la main — et c'est elle qui
  // possède la règle : toute revisite l'arrête. Sans quoi un cycle déjà en base
  // faisait grossir la pile à chaque tour dans le rendu serveur, où rien
  // d'autre ne la borne : l'écran ne rendait jamais la main, et l'éditeur ne
  // pouvait pas ouvrir l'écran qui répare la donnée (#546). Cette règle vivait
  // ici, écrite à la main ; depuis #549 elle vit dans
  // `lib/marche-structure.ts`, avec le journal qui nomme le cycle une fois
  // (ADR-0030). L'ordre de la liste, lui, ne se voit nulle part : le
  // formulaire la range dans un `Set`.
  const interdites = marcheDesStructures(categories).descendance(category.id)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Modifier — {category.name}</h1>
      <CategoryForm
        category={initial}
        categories={categories}
        excludedParentIds={interdites}
        action={updateCategoryAction}
      />
    </div>
  )
}
