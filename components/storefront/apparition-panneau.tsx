"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Fait entrer un panneau de l'accueil, au vocabulaire d'`APPARITION` (`lib/apparition.ts`).
 *
 * Deux écarts avec `blog-reveal.tsx`, tous deux voulus :
 *
 * - **rien n'est caché tant que le JS n'a pas parlé.** L'état d'attente est posé au montage, et
 *   seulement pour un panneau qui n'est pas encore à l'écran : un client sans scripts voit la
 *   page entière, jamais des blocs invisibles.
 * - **le premier panneau n'attend pas l'observateur** : son entrée est en CSS seul (`starting:`),
 *   donc sans clignotement et sans JS — il est déjà à l'écran au chargement.
 *
 * `prefers-reduced-motion` ne pose aucun état d'attente : tout est là d'emblée.
 */
export function ApparitionPanneau({
  children,
  className,
  premier = false,
}: {
  children: ReactNode
  className?: string
  /** Le panneau déjà à l'écran au chargement : il entre en CSS, pas en observateur. */
  premier?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [etat, setEtat] = useState<"joue" | "attente">("joue")

  useEffect(() => {
    if (premier) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const noeud = ref.current
    if (!noeud) return
    // Déjà dans la zone de déclenchement : rien n'entre, tout est là.
    if (noeud.getBoundingClientRect().top < window.innerHeight * 0.85) return

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
    observateur.observe(noeud)
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
