"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Prototype : l'apparition des panneaux, au vocabulaire `StaggeredFadeIn` de la page produit
 * (`docs/research/apple-product-page-ui.md` §9.2) — opacité 0 → 1 en 0,9 s, montée de 30 px
 * en 0,7 s, même courbe pour les deux, et 0,15 s d'écart par item. Les classes vivent dans
 * `apparition.ts`, que les composants serveur lisent aussi.
 *
 * Trois écarts avec l'original, assumés :
 *
 * - le déclencheur est un `IntersectionObserver` qui coupe les 15 % du bas, l'équivalent de
 *   `t - 85vh` — Apple y branche son propre moteur de keyframes, qui n'existe pas ici ;
 * - le premier panneau entre en CSS seul (`starting:`), donc sans JS et sans clignotement ;
 * - rien n'est caché tant que le JS n'a pas parlé : un `IntersectionObserver` aveugle laisse
 *   la page entière visible, là où `blog-reveal.tsx` la cacherait pour de bon.
 */

export function PanneauReveal({
  children,
  className,
  premier = false,
}: {
  children: ReactNode
  className?: string
  /** Le panneau déjà à l'écran au chargement : son entrée est en CSS, pas en observateur. */
  premier?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [etat, setEtat] = useState<"joue" | "attente">("joue")

  useEffect(() => {
    if (premier) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const node = ref.current
    if (!node) return
    // Déjà dans la zone de déclenchement : rien n'entre, tout est là.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.85) return

    setEtat("attente")
    const observateur = new IntersectionObserver(
      (entrees) => {
        for (const entree of entrees) {
          if (entree.isIntersecting) {
            setEtat("joue")
            observateur.disconnect()
          }
        }
      },
      { rootMargin: "-15% 0px 0px 0px" }
    )
    observateur.observe(node)
    return () => observateur.disconnect()
  }, [premier])

  return (
    <div
      ref={ref}
      data-reveal-etat={etat}
      className={cn("group/panneau", className)}
    >
      {children}
    </div>
  )
}
