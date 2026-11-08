"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { cn } from "@/lib/utils"

import {
  hrefPrototype,
  libellePeriode,
  lireReglages,
  PERIODES,
  type Reglages,
} from "./reglages"
import { nomDeLaVariante, VARIANTES } from "./variantes"

/**
 * PROTOTYPE (#964) — la barre de bas d'écran. ← → commutent les trois
 * lectures ; « Réglages » ouvre les six commutateurs qui ne valent que pour le
 * prototype (fenêtre, étiquettes, axe, montant, densité des Commandes, calme
 * des alertes). Tout passe dans l'URL, donc une capture se rejoue.
 *
 * Montée seulement quand `NODE_ENV === "development"` : une production ne peut
 * pas l'atteindre par un paramètre d'URL.
 */
export function SelecteurDePrototype() {
  const router = useRouter()
  const parametres = useSearchParams()
  const reglages = lireReglages(Object.fromEntries(parametres.entries()))
  const [ouverts, setOuverts] = useState(false)

  const estReel = reglages.variante === "reel"
  const index = VARIANTES.findIndex(
    (variante) => variante.cle === reglages.variante
  )
  const variante = index >= 0 ? VARIANTES[index] : undefined

  const naviguer = useCallback(
    (modifications: Partial<Reglages>) => {
      router.replace(hrefPrototype(reglages, modifications), {
        scroll: false,
      })
    },
    [reglages, router]
  )

  const tourner = useCallback(
    (pas: number) => {
      const base = index >= 0 ? index : pas > 0 ? -1 : 0
      const suivante =
        VARIANTES[(base + pas + VARIANTES.length) % VARIANTES.length]!
      naviguer({ variante: suivante.cle })
    },
    [index, naviguer]
  )

  useEffect(() => {
    if (estReel) return

    function surTouche(evenement: KeyboardEvent) {
      const cible = evenement.target as HTMLElement | null
      if (
        cible instanceof HTMLElement &&
        (cible.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName))
      ) {
        return
      }
      if (evenement.key === "ArrowLeft") tourner(-1)
      if (evenement.key === "ArrowRight") tourner(1)
    }

    window.addEventListener("keydown", surTouche)
    return () => window.removeEventListener("keydown", surTouche)
  }, [estReel, tourner])

  const cleCourante = variante ? variante.cle : "A"

  return (
    <div
      data-prototype-bar=""
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3 md:inset-x-auto md:right-4 md:justify-end"
    >
      <div className="pointer-events-auto relative">
        {ouverts && !estReel ? (
          <div
            id="prototype-reglages"
            className="absolute bottom-full left-1/2 mb-2 w-[min(92vw,27rem)] -translate-x-1/2 rounded-2xl bg-foreground p-3 text-background shadow-xl ring-1 ring-background/20 md:right-0 md:left-auto md:translate-x-0"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-medium">Réglages du prototype</span>
              <button
                type="button"
                onClick={() => setOuverts(false)}
                className="text-xs text-background/70 hover:text-background"
              >
                Fermer
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <Groupe titre="Période du graphique">
                {PERIODES.map((periode) => (
                  <Choix
                    key={periode.cle}
                    actif={periode.cle === reglages.periode}
                    onClick={() => naviguer({ periode: periode.cle })}
                  >
                    {libellePeriode(periode.cle, reglages.etiquettes)}
                  </Choix>
                ))}
              </Groupe>
              <Groupe titre="Étiquettes de période">
                <Choix
                  actif={reglages.etiquettes === "court"}
                  onClick={() => naviguer({ etiquettes: "court" })}
                >
                  Courtes (30 j)
                </Choix>
                <Choix
                  actif={reglages.etiquettes === "long"}
                  onClick={() => naviguer({ etiquettes: "long" })}
                >
                  Longues (30 jours)
                </Choix>
              </Groupe>
              <Groupe titre="Axe du graphique">
                <Choix
                  actif={reglages.axe === "epure"}
                  onClick={() => naviguer({ axe: "epure" })}
                >
                  Épuré
                </Choix>
                <Choix
                  actif={reglages.axe === "trait"}
                  onClick={() => naviguer({ axe: "trait" })}
                >
                  Un trait par barre
                </Choix>
              </Groupe>
              <Groupe titre="Montant du CA">
                <Choix
                  actif={reglages.montants === "reel"}
                  onClick={() => naviguer({ montants: "reel" })}
                >
                  Réel
                </Choix>
                <Choix
                  actif={reglages.montants === "cinq"}
                  onClick={() => naviguer({ montants: "cinq" })}
                >
                  5 chiffres
                </Choix>
                <Choix
                  actif={reglages.montants === "six"}
                  onClick={() => naviguer({ montants: "six" })}
                >
                  6 chiffres
                </Choix>
              </Groupe>
              <Groupe titre="Commandes récentes">
                <Choix
                  actif={reglages.commandes === "reel"}
                  onClick={() => naviguer({ commandes: "reel" })}
                >
                  2 réelles
                </Choix>
                <Choix
                  actif={reglages.commandes === "actif"}
                  onClick={() => naviguer({ commandes: "actif" })}
                >
                  5 actives
                </Choix>
              </Groupe>
              <Groupe titre="Alertes">
                <Choix
                  actif={reglages.alertes === "reel"}
                  onClick={() => naviguer({ alertes: "reel" })}
                >
                  Réelles
                </Choix>
                <Choix
                  actif={reglages.alertes === "calme"}
                  onClick={() => naviguer({ alertes: "calme" })}
                >
                  Toutes à zéro
                </Choix>
              </Groupe>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-1 rounded-full bg-foreground py-1 pl-1 text-xs text-background shadow-lg">
          {estReel ? (
            <>
              <span className="px-2 text-sm font-medium whitespace-nowrap">
                Tableau de bord actuel
              </span>
              <span
                aria-hidden="true"
                className="mx-0.5 h-5 w-px bg-background/25"
              />
              <button
                type="button"
                onClick={() =>
                  router.replace("/admin?variant=D", { scroll: false })
                }
                className="rounded-full px-2 py-1 font-medium text-background/80 hover:bg-background/15"
              >
                Ouvrir le prototype
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => tourner(-1)}
                aria-label="Variante précédente"
                className="flex size-8 items-center justify-center rounded-full text-base hover:bg-background/15"
              >
                ←
              </button>
              <span className="max-w-[9.5rem] truncate px-1.5 font-medium sm:max-w-none sm:text-sm">
                {cleCourante} — {nomDeLaVariante(cleCourante)}
              </span>
              <button
                type="button"
                onClick={() => tourner(1)}
                aria-label="Variante suivante"
                className="flex size-8 items-center justify-center rounded-full text-base hover:bg-background/15"
              >
                →
              </button>
              <span
                aria-hidden="true"
                className="mx-0.5 h-5 w-px bg-background/25"
              />
              <button
                type="button"
                onClick={() => setOuverts((valeur) => !valeur)}
                aria-expanded={ouverts}
                aria-controls="prototype-reglages"
                className={cn(
                  "rounded-full px-2 py-1 text-xs font-medium",
                  ouverts
                    ? "bg-background text-foreground"
                    : "text-background/80 hover:bg-background/15"
                )}
              >
                Réglages
              </button>
            </>
          )}

          {estReel ? null : (
            <>
              <span
                aria-hidden="true"
                className="mx-0.5 h-5 w-px bg-background/25"
              />
              <button
                type="button"
                onClick={() =>
                  router.replace("/admin?variant=reel", { scroll: false })
                }
                className="rounded-full px-2 py-1 text-xs font-medium text-background/80 hover:bg-background/15"
              >
                Réel
              </button>
            </>
          )}

          <span className="ml-1 hidden rounded-full bg-background/15 px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap md:inline">
            prototype #964
          </span>
        </div>
      </div>
    </div>
  )
}

function Groupe({
  titre,
  children,
}: {
  titre: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.6875rem] font-medium text-background/60">
        {titre}
      </span>
      <div role="group" aria-label={titre} className="flex flex-wrap gap-1">
        {children}
      </div>
    </div>
  )
}

function Choix({
  actif,
  onClick,
  children,
}: {
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        actif
          ? "bg-background text-foreground"
          : "text-background/80 hover:bg-background/15"
      )}
    >
      {children}
    </button>
  )
}
