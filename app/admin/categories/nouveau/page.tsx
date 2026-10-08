import type { Metadata } from "next"

import { CategoryForm } from "@/components/admin/category-form"
import { lireOptionsSelecteur } from "@/lib/use-cases/lecture-structure"
import { createCategoryAction } from "@/app/admin/categories/actions"

export const metadata: Metadata = {
  title: "Nouvelle catégorie",
}

export default async function NewCategoryPage() {
  // **Une porte, une lecture, et la forme que le formulaire consomme.** L'écran
  // n'a qu'une question — « quelles Structures puis-je lui proposer comme
  // parente ? » — et la Lecture y répond par sa projection la plus étroite :
  // l'identifiant et le nom, les deux seuls faits d'une option de sélecteur.
  //
  // L'écran lisait la rangée entière et la passait telle quelle : le formulaire
  // payait deux agrégats et une jointure de parente qu'il ne lit pas, et la
  // réduction aurait dû rester à chaque appelant, donc « pas un fait de plus »
  // n'aurait été qu'une convention (US 32). Elle est dans le module, une fois.
  //
  // Rien n'est exclu ici, contrairement à l'écran d'édition : une Structure
  // qu'aucune branche n'atteint reste **offerte**, parce qu'elle est
  // précisément ce qu'un éditeur doit pouvoir choisir pour la réparer. Le
  // formulaire propose, le serveur seul refuse (ADR-0030).
  const candidates = await lireOptionsSelecteur()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nouvelle catégorie</h1>
      <CategoryForm categories={candidates} action={createCategoryAction} />
    </div>
  )
}
