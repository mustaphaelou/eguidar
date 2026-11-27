import Link from "next/link"

import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import type { AnnonceActive } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"

interface RubanAnnonceProps {
  annonce: AnnonceActive | null
}

const RECETTE_TEXTE =
  "text-[12px] leading-[1.3334] tracking-[-0.01em] sm:text-[13px]"

const LIEN_ANNONCE =
  "font-medium text-link underline decoration-1 underline-offset-2 hover:text-foreground active:opacity-70 motion-safe:transition-[color,opacity]"

export function RubanAnnonce({ annonce }: RubanAnnonceProps) {
  if (!annonce) return null

  const url = annonce.lienUrl?.trim() ?? ""
  const libelle = annonce.lienLibelle?.trim() ?? ""
  const lien = url !== "" && libelle !== "" ? { url, libelle } : null

  return (
    <div
      role="region"
      aria-label="Annonce"
      className="border-b border-hairline bg-muted text-foreground"
    >
      <div
        className={cn(
          CONTENEUR_BOUTIQUE,
          RECETTE_TEXTE,
          "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-2.5 text-center"
        )}
      >
        <p className="break-words">{annonce.message}</p>
        {lien ? (
          <Link href={lien.url} className={LIEN_ANNONCE}>
            {lien.libelle}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
