import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import { ApparitionPanneau } from "@/components/storefront/apparition-panneau"
import { Button } from "@/components/ui/button"
import { APPARITION, APPARITION_FONDU, retard } from "@/lib/apparition"
import type { PanneauProduit } from "@/lib/accueil-panneaux"
import { cn } from "@/lib/utils"

/**
 * Le panneau de l'accueil : un champ (blanc, gris ou presque noir), une copie (titre, surtitre,
 * callout, une action) et une zone d'art ancrée en bas.
 *
 * Les nombres sont ceux d'apple.com, relevés dans `docs/research/apple-homepage.md` : deux
 * échelles de type (§2.2), des hauteurs de panneau constantes (§1.4), 12 px de gouttière (§1.3),
 * des coins carrés (§8.2) et des boutons pilule sans transition au survol (§2.3). Le noir est
 * celui du dépôt — `--foreground`, « presque noir » — et non le `#000` d'Apple.
 */

/** Échelle « hero » : 56 / 48 / 32, graisse 600. */
export const TITRE_HERO = [
  "text-[32px] leading-[1.125] tracking-[0.002em]",
  "sm:text-[48px] sm:leading-[1.0835] sm:tracking-[-0.002em]",
  "lg:text-[56px] lg:leading-[1.0714] lg:tracking-[-0.005em]",
].join(" ")

/** Échelle « hero » : surtitre 28 / 24 / 19, graisse 400. */
export const SURTITRE_HERO = [
  "text-[19px] leading-[1.2105] tracking-[0.012em]",
  "sm:text-[24px] sm:leading-[1.1667] sm:tracking-[0.009em]",
  "lg:text-[28px] lg:leading-[1.1429] lg:tracking-[0.007em]",
].join(" ")

/**
 * Échelle « promo » : 40 / 32, graisse 600 — celle des panneaux en duo et des bandes.
 *
 * Elle bascule à `xl:` (1280 px) là où apple.com bascule à 1069 : la contrainte n'est pas la
 * même. Chez Apple la tuile est large de 516 px à 1069, ici elle est large de 500 px à 1024 —
 * et à 40 px, un nom comme « Casque Sony WH-1000XM5 » se casse en deux sur une tuile de 500.
 */
export const TITRE_PROMO = [
  "text-[32px] leading-[1.125] tracking-[0.002em]",
  "xl:text-[40px] xl:leading-[1.1]",
].join(" ")

/** Échelle « promo » : surtitre 21 / 19, même marche que le titre. */
export const SURTITRE_PROMO = [
  "text-[19px] leading-[1.2105] tracking-[0.012em]",
  "xl:text-[21px] xl:leading-[1.1905] xl:tracking-[0.011em]",
].join(" ")

/** Le callout : 19 / 17 / 14. */
export const CALLOUT = [
  "text-[14px] leading-[1.2858] tracking-[-0.016em]",
  "sm:text-[17px] sm:leading-[1.2354] sm:tracking-[-0.022em]",
].join(" ")

/** Les hauteurs de panneau sont des constantes, pas des ratios d'image (§1.4). */
export const HAUTEUR_PLEINE_LARGEUR =
  "min-h-[500px] sm:min-h-[570px] lg:min-h-[580px]"
export const HAUTEUR_DUO = "min-h-[500px] sm:min-h-[490px] lg:min-h-[580px]"

/** La gouttière d'apple.com : 12 px de fond de page entre les panneaux (§1.3). */
export const GOUTTIERE_PANNEAUX = "gap-3"

export type Champ = "blanc" | "muted" | "noir"

export const CHAMP: Record<
  Champ,
  { panneau: string; second: string; lien: string }
> = {
  blanc: {
    panneau: "bg-background",
    second: "text-muted-foreground",
    lien: "text-link",
  },
  muted: {
    panneau: "bg-muted",
    second: "text-muted-foreground",
    lien: "text-link",
  },
  noir: {
    panneau: "bg-foreground text-background",
    second: "text-background/70",
    lien: "text-[#2997ff]",
  },
}

/**
 * La zone d'art : elle reste sous la copie, l'image est recadrée par le bas et centrée. Apple
 * fait traverser la sienne par la copie, parce que son art est composé autour du texte ; nos
 * photos sont des photos produit, elles tiennent sous la copie.
 *
 * Un Produit sans Image produit n'a pas d'art : le panneau garde sa hauteur et se passe de la
 * zone. Le jour où la photo arrive, elle se pose sous la copie sans rien déplacer.
 */
function ArtDuPanneau({
  panneau,
  sizes,
  immediat = false,
  index = 3,
}: {
  panneau: PanneauProduit
  sizes: string
  /** L'art du premier Panneau, au-dessus de la ligne de flottaison : il charge tout de suite. */
  immediat?: boolean
  index?: number
}) {
  if (!panneau.produit.image) return null

  return (
    <div
      className={cn(
        "pointer-events-none relative min-h-[200px] w-full flex-1 overflow-hidden px-3 pb-3",
        APPARITION_FONDU,
        retard(index)
      )}
    >
      <div className="relative h-full w-full">
        <Image
          src={panneau.produit.image}
          alt={panneau.titre}
          fill
          sizes={sizes}
          loading={immediat ? "eager" : undefined}
          className="object-cover object-bottom"
        />
      </div>
    </div>
  )
}

/** L'action principale : la pilule bleue, sans transition au survol (§2.3). */
function BoutonAcheter({
  panneau,
  taille,
}: {
  panneau: PanneauProduit
  taille: "hero" | "duo"
}) {
  return (
    <Button
      render={<Link href={panneau.href} />}
      aria-label={`Acheter, ${panneau.titre}`}
      className={cn(
        taille === "hero"
          ? "h-[41px] rounded-full px-[22px] text-[17px] leading-[1.1765] tracking-[-0.022em] transition-none"
          : "h-[33px] rounded-full px-4 text-[14px] leading-[1.2858] tracking-[-0.016em] transition-none"
      )}
    >
      Acheter
    </Button>
  )
}

/** L'action secondaire : le lien à chevron, le texte souligné, jamais le chevron. */
function LienChevron({
  href,
  children,
  champ = "muted",
  className,
}: {
  href: string
  children: ReactNode
  champ?: Champ
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/lien text-[17px] leading-[1.2354] tracking-[-0.022em]",
        CHAMP[champ].lien,
        className
      )}
    >
      <span className="group-hover/lien:underline">{children}</span>
      <span aria-hidden="true"> ›</span>
    </Link>
  )
}

/** Le panneau pleine largeur : copie en haut au centre, échelle « hero ». */
export function PanneauPleineLargeur({
  panneau,
  champ,
  premier = false,
  immediat = false,
  lienCatalogue = false,
}: {
  panneau: PanneauProduit
  champ: Champ
  premier?: boolean
  immediat?: boolean
  lienCatalogue?: boolean
}) {
  const c = CHAMP[champ]

  return (
    <ApparitionPanneau
      premier={premier}
      className={cn(
        "flex w-full flex-col text-center",
        c.panneau,
        HAUTEUR_PLEINE_LARGEUR,
        // Sans art, la copie tient le panneau seule : elle se centre au lieu de rester en
        // haut d'une zone vide. Le jour où la photo arrive, elle remonte et l'art prend le bas.
        !panneau.produit.image && "justify-center"
      )}
    >
      <div className="mx-auto flex w-full flex-col items-center px-6 pt-10 sm:pt-14">
        <h2 className={cn(TITRE_HERO, "font-semibold", APPARITION)}>
          {panneau.titre}
        </h2>
        <p
          className={cn(
            SURTITRE_HERO,
            c.second,
            "mt-3 max-w-[760px]",
            APPARITION,
            retard(1)
          )}
        >
          {panneau.surtitre}
        </p>
        <p className={cn(CALLOUT, "mt-4", APPARITION, retard(2))}>
          {panneau.callout}
        </p>
        <div
          className={cn(
            "mt-[17px] flex flex-wrap items-center justify-center gap-x-[17px] gap-y-3",
            APPARITION,
            retard(3)
          )}
        >
          <BoutonAcheter panneau={panneau} taille="hero" />
          {lienCatalogue ? (
            <LienChevron href="/produits" champ={champ}>
              Tout le catalogue
            </LienChevron>
          ) : null}
        </div>
      </div>
      <ArtDuPanneau panneau={panneau} sizes="100vw" immediat={immediat} />
    </ApparitionPanneau>
  )
}

/**
 * Le panneau en duo : deux par rangée, échelle « promo ». Sa copie porte un plancher de
 * hauteur — sans lui, un nom qui tient sur deux lignes décale la zone d'art de toute la
 * rangée.
 */
export function PanneauDuo({
  panneau,
  champ,
}: {
  panneau: PanneauProduit
  champ: Champ
}) {
  const c = CHAMP[champ]

  return (
    <ApparitionPanneau
      className={cn(
        "flex w-full flex-col text-center",
        c.panneau,
        HAUTEUR_DUO,
        !panneau.produit.image && "justify-center"
      )}
    >
      <div className="mx-auto flex min-h-[200px] w-full flex-col items-center px-5 pt-9 pb-4 sm:min-h-[225px] sm:pt-11 sm:pb-6">
        <h3 className={cn(TITRE_PROMO, "font-semibold", APPARITION)}>
          {panneau.titre}
        </h3>
        <p
          className={cn(
            SURTITRE_PROMO,
            c.second,
            "mt-2",
            APPARITION,
            retard(1)
          )}
        >
          {panneau.surtitre}
        </p>
        <p className={cn(CALLOUT, "mt-3", APPARITION, retard(2))}>
          {panneau.callout}
        </p>
        <div className={cn("mt-3", APPARITION, retard(3))}>
          <BoutonAcheter panneau={panneau} taille="duo" />
        </div>
      </div>
      <ArtDuPanneau
        panneau={panneau}
        sizes="(min-width: 640px) 50vw, 100vw"
        index={4}
      />
    </ApparitionPanneau>
  )
}
