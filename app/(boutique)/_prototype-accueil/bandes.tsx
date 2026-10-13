import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { CHAMP, SURTITRE_PROMO, TITRE_PROMO, type Champ } from "./echelles"
import { APPARITION, retard } from "./apparition"
import { PanneauReveal } from "./mouvement"
import { BANDE_SERVICE } from "./panneaux"

/**
 * Prototype : les bandes. L'en-tête d'une bande est le même partout — un titre, un surtitre —
 * et la bande de service est partagée par A et C (B la refuse, le pied de page la porte déjà).
 */

export function EnteteDeBande({
  titre,
  surtitre,
  champ,
  className,
}: {
  titre: string
  surtitre: string
  champ: Champ
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <h2 className={cn(TITRE_PROMO, "font-semibold", APPARITION)}>{titre}</h2>
      <p
        className={cn(
          SURTITRE_PROMO,
          CHAMP[champ].second,
          APPARITION,
          retard(1)
        )}
      >
        {surtitre}
      </p>
    </div>
  )
}

export function BandeService({ children }: { children?: ReactNode }) {
  const champ: Champ = "noir"
  const c = CHAMP[champ]
  return (
    <PanneauReveal
      className={cn("w-full px-4 py-14 sm:px-6 sm:py-16", c.panneau)}
    >
      <div className="mx-auto flex max-w-[980px] flex-col items-center gap-8">
        <EnteteDeBande
          titre={BANDE_SERVICE.titre}
          surtitre={BANDE_SERVICE.surtitre}
          champ={champ}
        />
        <ul className="grid w-full gap-8 text-center sm:grid-cols-3 sm:gap-6">
          {BANDE_SERVICE.items.map((item, index) => (
            <li
              key={item.titre}
              className={cn(
                "flex flex-col gap-2",
                APPARITION,
                retard(index + 2)
              )}
            >
              <p className="text-[17px] leading-[1.2354] font-semibold tracking-[-0.022em]">
                {item.titre}
              </p>
              <p
                className={cn(
                  "text-[14px] leading-[1.2858] tracking-[-0.016em]",
                  c.second
                )}
              >
                {item.texte}
              </p>
            </li>
          ))}
        </ul>
      </div>
      {children}
    </PanneauReveal>
  )
}
