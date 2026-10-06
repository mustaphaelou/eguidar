import { notFound } from "next/navigation"

import {
  CategoryForm,
  type CategoryFormInitial,
} from "@/components/admin/category-form"
import { listAdminCategoriesWithCounts } from "@/lib/use-cases/admin-structure"
import { updateCategoryAction } from "@/app/admin/categories/actions"

/**
 * Une Structure et toutes ses descendantes : les parentes qu'un éditeur ne
 * peut pas choisir, puisque se suspendre sous l'une d'elles refermerait un
 * cycle.
 *
 * La marche garde les identifiants qu'elle a déjà descendus, et **toute**
 * revisite l'arrête — le même garde, et pour la même raison, que
 * `collectCategoryAndDescendantIds` côté boutique : un cycle déjà en base se
 * referme sur lui-même ici aussi, et la pile grossissait à chaque tour sans
 * qu'aucune transaction n'ait à expirer. Cette marche-ci tourne dans le rendu
 * serveur, où rien d'autre ne la borne : le rendu ne rendait donc jamais la
 * main, et l'éditeur ne pouvait pas ouvrir l'écran qui répare la donnée
 * (#546). Le garde rejette les revisites, pas la longueur : une branche
 * profonde et acyclique passe entière, et aucune profondeur maximale n'est une
 * règle de ce dépôt (ADR-0027).
 *
 * C'est la dernière fois qu'elle est écrite ici : #549 la fera traverser
 * `lib/marche-structure.ts`, le propriétaire de la règle (ADR-0030).
 */
function collectDescendantIds(
  categories: Awaited<ReturnType<typeof listAdminCategoriesWithCounts>>,
  rootId: string
): string[] {
  const childrenByParent = new Map<string, string[]>()
  for (const category of categories) {
    if (category.parentId) {
      const siblings = childrenByParent.get(category.parentId) ?? []
      siblings.push(category.id)
      childrenByParent.set(category.parentId, siblings)
    }
  }
  const descendants: string[] = []
  const vus = new Set([rootId])
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()!
    for (const child of childrenByParent.get(id) ?? []) {
      if (vus.has(child)) continue
      vus.add(child)
      descendants.push(child)
      stack.push(child)
    }
  }
  return descendants
}

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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Modifier — {category.name}</h1>
      <CategoryForm
        category={initial}
        categories={categories}
        excludedParentIds={[
          category.id,
          ...collectDescendantIds(categories, category.id),
        ]}
        action={updateCategoryAction}
      />
    </div>
  )
}
