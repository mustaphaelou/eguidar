"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export function ApparitionPanneau({
  children,
  className,
  premier = false,
}: {
  children: ReactNode
  className?: string
  premier?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [etat, setEtat] = useState<"joue" | "attente">("joue")

  useEffect(() => {
    if (premier) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const noeud = ref.current
    if (!noeud) return
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
