"use client"

import type { CSSProperties } from "react"
import Link from "next/link"

import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import {
  buildSearchHref,
  SEARCH_SORT_DEFAULT,
  SEARCH_SORT_OPTIONS,
} from "@/lib/search-params"
import type { NavCategory } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"

import { SearchSuggestions } from "./search-suggestions"

export interface LienDeFeuille {
  readonly label: string
  readonly href: string
}

export interface ColonneDeFeuille {
  readonly id: string
  readonly titre: string
  readonly principal: boolean
  readonly liens: readonly LienDeFeuille[]
}

export function estPointeurFin(event: React.PointerEvent): boolean {
  return event.pointerType === "mouse"
}

export function hrefMarqueCategorie(
  categorySlug: string,
  marque: string
): string {
  return buildSearchHref(
    "",
    { categorySlug, brand: [marque] },
    {},
    {},
    "/produits"
  )
}

export function colonnesDeLaFeuille(
  categorie: NavCategory
): readonly ColonneDeFeuille[] {
  const lienTout: LienDeFeuille = {
    label: `Tout ${categorie.name}`,
    href: `/categorie/${categorie.slug}`,
  }
  const liensMarques: LienDeFeuille[] = categorie.brands.map((marque) => ({
    label: marque,
    href: hrefMarqueCategorie(categorie.slug, marque),
  }))
  const liensTris: LienDeFeuille[] = SEARCH_SORT_OPTIONS.filter(
    (option) => option.id !== SEARCH_SORT_DEFAULT
  ).map((option) => ({
    label: option.label,
    href: buildSearchHref(
      "",
      { categorySlug: categorie.slug },
      {},
      { sort: option.id },
      "/produits"
    ),
  }))
  const colonneDecouvrir: ColonneDeFeuille = {
    id: "decouvrir",
    titre: "Découvrir",
    principal: false,
    liens: [...liensTris, { label: "Tout le catalogue", href: "/produits" }],
  }

  if (categorie.children.length > 0) {
    const colonnes: ColonneDeFeuille[] = [
      {
        id: "explorer",
        titre: `Explorer ${categorie.name}`,
        principal: true,
        liens: [
          lienTout,
          ...categorie.children.map((enfant) => ({
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

function FeuilleDuBandeau({
  id,
  ariaLabel,
  panelRef,
  onBackdropClick,
  onBackdropFinePointerEnter,
  onPanelPointerEnter,
  contentClassName,
  children,
}: {
  id?: string
  ariaLabel?: string
  panelRef?: React.RefObject<HTMLDivElement | null>
  onBackdropClick: () => void
  onBackdropFinePointerEnter?: () => void
  onPanelPointerEnter?: () => void
  contentClassName: string
  children: React.ReactNode
}) {
  return (
    <>
      <div
        data-slot="voile-sombre"
        aria-hidden="true"
        className="fixed inset-0 z-0 bg-voile-sombre"
        onClick={onBackdropClick}
        onPointerEnter={
          onBackdropFinePointerEnter
            ? (event) => {
                if (estPointeurFin(event)) onBackdropFinePointerEnter()
              }
            : undefined
        }
      />

      <div
        ref={panelRef}
        id={id}
        data-slot="feuille-navigation"
        role={ariaLabel ? "region" : undefined}
        aria-label={ariaLabel}
        onPointerEnter={onPanelPointerEnter}
        className="voile-depoli absolute inset-x-0 inset-bs-0 z-10 pbs-11 shadow-[0_24px_48px_-32px_oklch(0.2_0_none/0.22)] [--voile-depoli-flou:20px] [--voile-depoli-opacite:94%] [--voile-depoli-saturation:180%]"
      >
        <div className={cn(CONTENEUR_BOUTIQUE, contentClassName)}>
          {children}
        </div>
      </div>
    </>
  )
}

export function FeuilleStructure({
  categorie,
  panelRef,
  onClose,
  onNavigate,
  onBackdropFinePointerEnter,
  onPanelPointerEnter,
}: {
  categorie: NavCategory
  panelRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onNavigate: () => void
  onBackdropFinePointerEnter: () => void
  onPanelPointerEnter: () => void
}) {
  const colonnes = colonnesDeLaFeuille(categorie)
  const grille =
    colonnes.length >= 3
      ? "grid-cols-[minmax(14rem,1.45fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]"
      : "grid-cols-[minmax(14rem,1.45fr)_minmax(12rem,1fr)]"

  return (
    <FeuilleDuBandeau
      id={`feuille-categorie-${categorie.slug}`}
      ariaLabel={categorie.name}
      panelRef={panelRef}
      onBackdropClick={onClose}
      onBackdropFinePointerEnter={onBackdropFinePointerEnter}
      onPanelPointerEnter={onPanelPointerEnter}
      contentClassName="pbs-10 pbe-14"
    >
      <div key={categorie.slug} className={cn("grid gap-x-12", grille)}>
        {colonnes.map((colonne, index) => (
          <div
            key={colonne.id}
            data-slot="colonne-feuille"
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
    </FeuilleDuBandeau>
  )
}

export function FeuilleRecherche({
  inputRef,
  liensRapides,
  onClose,
  onNavigate,
  onSubmitQuery,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  liensRapides: readonly LienDeFeuille[]
  onClose: () => void
  onNavigate: () => void
  onSubmitQuery: (query: string) => void
}) {
  return (
    <FeuilleDuBandeau onBackdropClick={onClose} contentClassName="pbs-6 pbe-10">
      <form
        method="GET"
        action="/recherche"
        className="relative flex flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          const query = String(
            new FormData(event.currentTarget).get("q") ?? ""
          ).trim()
          onSubmitQuery(query)
        }}
      >
        <SearchSuggestions
          inputRef={inputRef}
          surface="feuille"
          quickLinks={liensRapides}
          onEscape={onClose}
          onNavigate={onNavigate}
        />
      </form>
    </FeuilleDuBandeau>
  )
}

export function MenuMobileStructures({
  categories,
  ouvert,
  categorieDepliee,
  menuPanelRef,
  onBasculerCategorie,
  onNavigate,
}: {
  categories: readonly NavCategory[]
  ouvert: boolean
  categorieDepliee: string | null
  menuPanelRef: React.RefObject<HTMLDivElement | null>
  onBasculerCategorie: (slug: string) => void
  onNavigate: () => void
}) {
  return (
    <div
      ref={menuPanelRef}
      id="menu-categories"
      hidden={!ouvert}
      data-slot={ouvert ? "feuille-navigation" : undefined}
      className="absolute inset-x-0 inset-bs-11 z-10 h-[calc(100dvh-2.75rem)] overflow-y-auto bg-background lg:hidden"
    >
      <nav
        aria-label="Catégories"
        className={cn(CONTENEUR_BOUTIQUE, "pbs-6 pbe-12")}
      >
        <ul className="flex flex-col gap-1">
          {categories.map((categorie, index) => {
            const aDesDetails =
              categorie.children.length > 0 || categorie.brands.length > 0
            const estDepliee = categorieDepliee === categorie.slug
            return (
              <li
                key={categorie.slug}
                data-slot={ouvert ? "element-feuille" : undefined}
                style={{ "--rang-element": index } as CSSProperties}
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/categorie/${categorie.slug}`}
                    onClick={onNavigate}
                    className="flex flex-1 items-center text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-encre-menu transition-[color,opacity] duration-150 ease-out min-block-11 active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                  >
                    {categorie.name}
                  </Link>
                  {aDesDetails ? (
                    <button
                      type="button"
                      aria-label={
                        estDepliee
                          ? `Réduire ${categorie.name}`
                          : `Déplier ${categorie.name}`
                      }
                      aria-expanded={estDepliee}
                      onClick={() => onBasculerCategorie(categorie.slug)}
                      className="zone-tactile inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        className={cn(
                          "size-4 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
                          estDepliee && "rotate-180"
                        )}
                        fill="none"
                      >
                        <path
                          d="m4 6 4 4 4-4"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                </div>

                {aDesDetails && estDepliee ? (
                  <div className="border-is pis-4 mbs-1 mbe-3 flex flex-col gap-3 border-hairline">
                    {categorie.children.length > 0 ? (
                      <ul className="flex flex-col gap-0.5">
                        {categorie.children.map((enfant) => (
                          <li key={enfant.slug}>
                            <Link
                              href={`/categorie/${enfant.slug}`}
                              onClick={onNavigate}
                              className="flex items-center text-[15px] leading-[1.35] font-medium text-encre-menu transition-[color,opacity] duration-150 ease-out min-block-9 active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                            >
                              {enfant.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {categorie.brands.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <p className="text-[12px] leading-[1.3334] tracking-[-0.01em] text-muted-foreground">
                          Par marque
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                          {categorie.brands.map((marque) => (
                            <li key={marque}>
                              <Link
                                href={hrefMarqueCategorie(
                                  categorie.slug,
                                  marque
                                )}
                                onClick={onNavigate}
                                className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-[12px] leading-[1.3334] font-medium text-encre-menu transition-[background-color,color,opacity] duration-150 ease-out active:opacity-70 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
                              >
                                {marque}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
