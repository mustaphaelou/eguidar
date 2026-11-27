import Link from "next/link"

import {
  apparierLienAnnonce,
  LIEN_ANNONCE,
  RECETTE_TEXTE_ANNONCE,
  RUBAN_ANNONCE_CONTENU,
  RUBAN_ANNONCE_SURFACE,
} from "@/lib/annonce-contrat"
import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import type { AnnonceActive } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"

interface RubanAnnonceProps {
  annonce: AnnonceActive | null
}

export function RubanAnnonce({ annonce }: RubanAnnonceProps) {
  if (!annonce) return null

  const lien = apparierLienAnnonce(annonce.lienUrl, annonce.lienLibelle)

  return (
    <div role="region" aria-label="Annonce" className={RUBAN_ANNONCE_SURFACE}>
      <div
        className={cn(
          CONTENEUR_BOUTIQUE,
          RECETTE_TEXTE_ANNONCE,
          RUBAN_ANNONCE_CONTENU
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
