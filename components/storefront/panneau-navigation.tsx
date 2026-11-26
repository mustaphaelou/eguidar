"use client"

import type { CSSProperties } from "react"
import Link from "next/link"

import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { buildSearchHref } from "@/lib/search-params"
import type { NavCategory } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"

export interface LienNavigation {
  readonly label: string
  readonly href: string
}

export interface ColonneNavigation {
  readonly id: string
  readonly titre: string
  readonly principal: boolean
  readonly liens: readonly LienNavigation[]
}

export function colonnesDuPanneau(
  categorie: NavCategory
): readonly ColonneNavigation[] {
  const enfants = categorie.children ?? []
  const marques = categorie.brands ?? []
  const lienTout: LienNavigation = {
    label: `Tout ${categorie.name}`,
    href: `/categorie/${categorie.slug}`,
  }
  const liensMarques: LienNavigation[] = marques.map((marque) => ({
    label: marque,
    href: buildSearchHref(
      "",
      { categorySlug: categorie.slug, brand: [marque] },
      {},
      {},
      "/produits"
    ),
  }))
  const colonneDecouvrir: ColonneNavigation = {
    id: "decouvrir",
    titre: "Découvrir",
    principal: false,
    liens: [
      {
        label: "Nouveautés",
        href: buildSearchHref(
          "",
          { categorySlug: categorie.slug },
          {},
          { sort: "nouveautes" },
          "/produits"
        ),
      },
      {
        label: "Prix croissant",
        href: buildSearchHref(
          "",
          { categorySlug: categorie.slug },
          {},
          { sort: "prix-asc" },
          "/produits"
        ),
      },
      {
        label: "Prix décroissant",
        href: buildSearchHref(
          "",
          { categorySlug: categorie.slug },
          {},
          { sort: "prix-desc" },
          "/produits"
        ),
      },
      {
        label: "Tout le catalogue",
        href: "/produits",
      },
    ],
  }

  if (enfants.length > 0) {
    const colonnes: ColonneNavigation[] = [
      {
        id: "explorer",
        titre: `Explorer ${categorie.name}`,
        principal: true,
        liens: [
          lienTout,
          ...enfants.map((enfant) => ({
            label: enfant.name,
            href: `/categorie/${enfant.slug}`,
          })),
        ],
      },
    ]

    if (liensMarques.length > 0) {
      colonnes.push({
        id: "marques",
        titre: "Par marque",
        principal: false,
        liens: liensMarques,
      })
    }

    colonnes.push(colonneDecouvrir)
    return colonnes
  }

  return [
    {
      id: "explorer",
      titre: `Explorer ${categorie.name}`,
      principal: true,
      liens: [lienTout, ...liensMarques],
    },
    colonneDecouvrir,
  ]
}

export function PanneauNavigation({
  categorie,
  panelRef,
  onClose,
  onNavigate,
  onBackdropPointerEnter,
  onPanelPointerEnter,
}: {
  categorie: NavCategory
  panelRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onNavigate: () => void
  onBackdropPointerEnter?: (pointerType: string) => void
  onPanelPointerEnter?: () => void
}) {
  const colonnes = colonnesDuPanneau(categorie)
  const grille =
    colonnes.length >= 3
      ? "grid-cols-[minmax(14rem,1.45fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]"
      : "grid-cols-[minmax(14rem,1.45fr)_minmax(12rem,1fr)]"

  return (
    <>
      <div
        data-slot="voile-navigation"
        aria-hidden="true"
        className="voile-floute fixed inset-0 z-0 bg-voile-navigation"
        onClick={onClose}
        onPointerEnter={(event) => onBackdropPointerEnter?.(event.pointerType)}
      />

      <div
        ref={panelRef}
        id={`panneau-categorie-${categorie.slug}`}
        data-slot="panneau-navigation"
        role="region"
        aria-label={categorie.name}
        onPointerEnter={onPanelPointerEnter}
        className="absolute inset-x-0 inset-bs-0 z-10 bg-background pbs-11 shadow-[0_24px_48px_-32px_oklch(0.2_0_none/0.22)]"
      >
        <div className={cn(CONTENEUR_BOUTIQUE, "pbs-10 pbe-14")}>
          <div key={categorie.slug} className={cn("grid gap-x-12", grille)}>
            {colonnes.map((colonne, index) => (
              <div
                key={colonne.id}
                data-slot="colonne-navigation"
                style={{ "--rang-colonne": index } as CSSProperties}
                className="flex flex-col"
              >
                <p className="mbe-3 text-[12px] leading-[1.3334] font-normal tracking-[-0.01em] text-muted-foreground">
                  {colonne.titre}
                </p>
                <ul
                  className={cn(
                    "flex flex-col",
                    colonne.principal ? "gap-1.5" : "gap-1"
                  )}
                >
                  {colonne.liens.map((lien) => (
                    <li key={lien.href}>
                      <Link
                        href={lien.href}
                        onClick={onNavigate}
                        className={cn(
                          "inline-flex items-center text-encre-menu transition-[color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
                          colonne.principal
                            ? "py-0.5 text-[24px] leading-[1.1667] font-semibold tracking-[-0.02em]"
                            : "text-[12px] leading-[1.3334] font-semibold tracking-[-0.01em] min-block-6"
                        )}
                      >
                        {lien.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
