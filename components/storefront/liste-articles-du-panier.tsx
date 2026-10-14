"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import type { ArticleDuPanier as ArticleDuPanierDonnees } from "@/lib/panier"
import { cn } from "@/lib/utils"
import { ArticleDuPanier } from "./article-du-panier"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

/** Le temps de l'annulation : au-delà, le retrait est définitif. */
const DUREE_ANNULATION_MS = 5000

interface Annonce {
  article: ArticleDuPanierDonnees
  /** L'annulation est en vol : l'annonce ne s'efface pas tant qu'elle juge. */
  enCours: boolean
  /** Le refus du serveur, relayé verbatim. */
  refus?: string
}

/**
 * La liste des Articles du panier, et l'annonce qui survit au départ d'une
 * ligne : le retrait est immédiat, l'annulation le rejoue à l'envers.
 */
export function ListeArticlesDuPanier({
  articles,
  port,
}: {
  articles: readonly ArticleDuPanierDonnees[]
  port?: PortMutationsDuPanier
}) {
  const [annonce, setAnnonce] = useState<Annonce | null>(null)
  const [derniereAnnonce, setDerniereAnnonce] = useState<Annonce | null>(null)
  if (annonce && annonce !== derniereAnnonce) {
    setDerniereAnnonce(annonce)
  }
  const annonceAffichee = annonce ?? derniereAnnonce
  const { ajouter } = useMutationsDuPanier(port)

  function signalerRetrait(article: ArticleDuPanierDonnees) {
    setAnnonce({ article, enCours: false })
  }

  function signalerRetour(article: ArticleDuPanierDonnees) {
    setAnnonce((courante) =>
      courante?.article.variantId === article.variantId ? null : courante
    )
  }

  function annulerRetrait() {
    if (!annonce || annonce.enCours) return
    ajouter(annonce.article.variantId, annonce.article.quantity, (resultat) => {
      if (resultat.ok) {
        setAnnonce(null)
        return
      }
      // Le refus a sa voix dans l'annonce : l'Article n'est pas rentré.
      setAnnonce((courante) =>
        courante
          ? { ...courante, enCours: false, refus: resultat.message }
          : null
      )
    })
    setAnnonce({ ...annonce, enCours: true, refus: undefined })
  }

  // L'occasion d'annuler ne dure pas : elle s'efface seule, et pas tant que
  // l'annulation est en vol — c'est elle qui juge l'annonce.
  useEffect(() => {
    if (!annonce || annonce.enCours) return
    const minuteur = setTimeout(() => setAnnonce(null), DUREE_ANNULATION_MS)
    return () => clearTimeout(minuteur)
  }, [annonce])

  return (
    <>
      <ul>
        {articles.map((article) => (
          <ArticleDuPanier
            key={article.variantId}
            article={article}
            port={port}
            onRetire={signalerRetrait}
            onRetour={signalerRetour}
          />
        ))}
      </ul>

      <div
        role="status"
        inert={!annonce}
        aria-hidden={!annonce}
        className={cn(
          "inset-inline-0 inset-block-end-0 fixed z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] duration-200 ease-out motion-safe:transition-[opacity,transform] motion-reduce:transition-opacity",
          annonce
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none opacity-0 motion-safe:translate-y-4 motion-safe:scale-95 motion-reduce:translate-y-0 motion-reduce:scale-100"
        )}
      >
        {annonceAffichee ? (
          <div className="flex max-w-full items-center gap-3 rounded-full bg-foreground py-1.5 ps-4 pe-1.5 text-sm text-background shadow-lg">
            <p className="truncate">
              {annonceAffichee.refus ?? "Retiré du panier"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 rounded-full text-background hover:bg-background/15 hover:text-background"
              disabled={annonceAffichee.enCours}
              aria-label={`Annuler le retrait de ${annonceAffichee.article.productName}`}
              onClick={annulerRetrait}
            >
              {annonceAffichee.enCours ? "Rétablissement…" : "Annuler"}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}
