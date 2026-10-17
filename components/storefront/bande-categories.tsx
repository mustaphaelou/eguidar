import Link from "next/link"

import { ApparitionPanneau } from "@/components/storefront/apparition-panneau"
import {
  CHAMP,
  SURTITRE_PROMO,
  TITRE_PROMO,
} from "@/components/storefront/panneau-accueil"
import { BANDE_CATEGORIES, decompteDesProduits } from "@/lib/accueil-panneaux"
import { APPARITION, retard } from "@/lib/apparition"
import type { NoeudAccueil } from "@/lib/use-cases/lecture-structure"
import { cn } from "@/lib/utils"

export function BandeCategories({
  categories,
}: {
  categories: NoeudAccueil[]
}) {
  if (categories.length === 0) return null

  return (
    <ApparitionPanneau
      className={cn("w-full px-4 py-14 sm:px-6 sm:py-16", CHAMP.muted.panneau)}
    >
      <div className="mx-auto flex max-w-[980px] flex-col gap-10">
        <div className="flex flex-col items-center gap-2">
          <h2 className={cn(TITRE_PROMO, "font-semibold", APPARITION)}>
            {BANDE_CATEGORIES.titre}
          </h2>
          <p
            className={cn(
              SURTITRE_PROMO,
              CHAMP.muted.second,
              APPARITION,
              retard(1)
            )}
          >
            {BANDE_CATEGORIES.surtitre}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-6">
          {categories.map((categorie, index) => (
            <li
              key={categorie.id}
              className={cn(APPARITION, retard(index + 2))}
            >
              <Link
                href={`/categorie/${categorie.slug}`}
                className="group/categorie flex flex-col items-center gap-1 text-center"
              >
                <span className="text-[17px] leading-[1.2354] font-semibold tracking-[-0.022em]">
                  {categorie.name}
                </span>
                <span
                  className={cn(
                    "text-[14px] leading-[1.2858] tracking-[-0.016em]",
                    CHAMP.muted.second
                  )}
                >
                  {decompteDesProduits(categorie)}
                </span>
                <span
                  className={cn(
                    "mt-1 text-[14px] leading-[1.2858] tracking-[-0.016em]",
                    CHAMP.muted.lien
                  )}
                >
                  <span className="group-hover/categorie:underline">
                    {BANDE_CATEGORIES.cta}
                  </span>
                  <span aria-hidden="true"> ›</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </ApparitionPanneau>
  )
}
