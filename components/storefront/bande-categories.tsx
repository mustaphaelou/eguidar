import Link from "next/link"

import { ApparitionPanneau } from "@/components/storefront/apparition-panneau"
import {
  CHAMP,
  SURTITRE_PROMO,
  TITRE_PROMO,
} from "@/components/storefront/panneau-accueil"
import { BANDE_CATEGORIES, decompteDesProduits } from "@/lib/accueil-panneaux"
import { APPARITION, retard } from "@/lib/apparition"
import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
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
      className={cn(
        "w-full py-[clamp(3rem,2rem+3vw,4.5rem)]",
        CHAMP.muted.panneau
      )}
    >
      <div className={cn(CONTENEUR_BOUTIQUE, "flex flex-col gap-8")}>
        <div className="flex flex-col items-center gap-2 text-center">
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
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3">
          {categories.map((categorie, index) => (
            <li
              key={categorie.id}
              className={cn(
                "row-span-3 grid grid-rows-subgrid",
                APPARITION,
                retard(index + 2)
              )}
            >
              <Link
                href={`/categorie/${categorie.slug}`}
                className="group/categorie row-span-3 grid grid-rows-subgrid items-center justify-items-center gap-y-1.5 rounded-2xl bg-background px-3 py-5 text-center ring-1 ring-hairline transition-[box-shadow,opacity] duration-150 ease-out ring-inset active:opacity-80 motion-safe:transition-[box-shadow,opacity,transform] motion-safe:active:scale-[0.98] [@media(hover:hover)_and_(pointer:fine)]:hover:ring-bordure-subtile"
              >
                <span className="self-end text-sm leading-snug font-semibold text-foreground">
                  {categorie.name}
                </span>
                <span
                  className={cn("text-xs tabular-nums", CHAMP.muted.second)}
                >
                  {decompteDesProduits(categorie)}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 self-start text-xs font-medium",
                    CHAMP.muted.lien
                  )}
                >
                  <span className="[@media(hover:hover)_and_(pointer:fine)]:group-hover/categorie:underline">
                    {BANDE_CATEGORIES.cta}
                  </span>
                  <span
                    aria-hidden="true"
                    className="inline-block motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover/categorie:translate-x-0.5"
                  >
                    ›
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </ApparitionPanneau>
  )
}
