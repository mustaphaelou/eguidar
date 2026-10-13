import Link from "next/link"

import { formatPrice } from "@/lib/money"
import { cn } from "@/lib/utils"

import { EnteteDeBande } from "./bandes"
import { CHAMP, GOUTTIERE, HAUTEUR_HERO_HAUT } from "./echelles"
import { APPARITION, retard } from "./apparition"
import { PanneauReveal } from "./mouvement"
import {
  BANDE_CATEGORIES,
  decompte,
  type DonneesAccueil,
  type Histoire,
} from "./panneaux"
import { PanneauHero } from "./pieces"

/**
 * Variante C — « L'index » : un seul panneau porte une histoire, le reste est comprimé.
 * Un héros haut (692 / 650 / 500, la hauteur d'Apple quand la fenêtre est haute), puis les
 * cinq autres histoires en lignes — nom, marque, prix, un chevron — la bande des catégories
 * en rail, et la bande de service.
 *
 * C'est le plancher : ce que devient la mosaïque si le catalogue ne porte pas plus de panneaux
 * que ça. La page est deux fois plus courte que A et B.
 */

const BANDE_AUTRES = {
  titre: "Aussi en vedette",
  surtitre: "Les autres produits que nous mettons en avant.",
} as const

export function VarianteC({ donnees }: { donnees: DonneesAccueil }) {
  const [premier, ...autres] = donnees.histoires

  return (
    <div className={cn("flex flex-col bg-background", GOUTTIERE)}>
      {premier ? (
        <PanneauHero
          histoire={premier}
          champ="muted"
          premier
          secondaire
          hauteur={HAUTEUR_HERO_HAUT}
        />
      ) : null}
      <IndexDesHistoires histoires={autres} />
      <BandeCategoriesRail categories={donnees.categories} />
    </div>
  )
}

/** Les autres histoires, en lignes : la forme la plus courte qui garde le prix et le lien. */
function IndexDesHistoires({ histoires }: { histoires: Histoire[] }) {
  if (histoires.length === 0) return null
  return (
    <PanneauReveal className="w-full px-4 py-14 sm:px-6">
      <div className="mx-auto flex max-w-[800px] flex-col gap-8">
        <EnteteDeBande
          titre={BANDE_AUTRES.titre}
          surtitre={BANDE_AUTRES.surtitre}
          champ="blanc"
        />
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {histoires.map((histoire, index) => (
            <li
              key={histoire.produit.id}
              className={cn(APPARITION, retard(index + 2))}
            >
              <Link
                href={histoire.href}
                className="group/ligne flex items-center justify-between gap-6 py-5"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[17px] leading-[1.2354] font-semibold tracking-[-0.022em] group-hover/ligne:underline">
                    {histoire.titre}
                  </span>
                  <span
                    className={cn(
                      "text-[14px] leading-[1.2858] tracking-[-0.016em]",
                      CHAMP.blanc.second
                    )}
                  >
                    {histoire.produit.brand}
                    {histoire.copie ? "" : " · pas encore de copie"}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-5">
                  <span className="text-[17px] leading-[1.2354] tracking-[-0.022em]">
                    {formatPrice(histoire.produit.minPrice)}
                  </span>
                  <span className={cn("text-[17px]", CHAMP.blanc.lien)}>
                    Voir<span aria-hidden="true"> ›</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PanneauReveal>
  )
}

/** La bande des catégories en rail : six pastilles qui défilent, sans minuteur, sans flèches. */
function BandeCategoriesRail({
  categories,
}: {
  categories: DonneesAccueil["categories"]
}) {
  if (categories.length === 0) return null
  return (
    <PanneauReveal className={cn("w-full py-14 sm:py-16", CHAMP.muted.panneau)}>
      <div className="mx-auto flex max-w-[980px] flex-col gap-8">
        <EnteteDeBande
          titre={BANDE_CATEGORIES.titre}
          surtitre={BANDE_CATEGORIES.surtitre}
          champ="muted"
        />
        <ul className="flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2 sm:px-6">
          {categories.map((categorie, index) => (
            <li
              key={categorie.id}
              className={cn(
                "shrink-0 snap-start",
                APPARITION,
                retard(index + 2)
              )}
            >
              <Link
                href={`/categorie/${categorie.slug}`}
                className="group/tuile flex min-h-[180px] min-w-[220px] flex-col items-center justify-center gap-1 bg-background px-6 py-8 text-center"
              >
                <span className="text-[21px] leading-[1.1905] font-semibold tracking-[0.011em]">
                  {categorie.name}
                </span>
                <span
                  className={cn(
                    "text-[14px] leading-[1.2858] tracking-[-0.016em]",
                    CHAMP.blanc.second
                  )}
                >
                  {decompte(categorie)}
                </span>
                <span
                  className={cn(
                    "mt-2 text-[14px] leading-[1.2858] tracking-[-0.016em]",
                    CHAMP.blanc.lien
                  )}
                >
                  <span className="group-hover/tuile:underline">
                    {BANDE_CATEGORIES.cta}
                  </span>
                  <span aria-hidden="true"> ›</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PanneauReveal>
  )
}
