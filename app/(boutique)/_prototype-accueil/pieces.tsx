import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  CALLOUT,
  CHAMP,
  HAUTEUR_HERO,
  SURTITRE_HERO,
  TITRE_HERO,
  type Champ,
} from "./echelles"
import { APPARITION, APPARITION_FONDU, retard } from "./apparition"
import { PanneauReveal } from "./mouvement"
import { type Histoire } from "./panneaux"

/**
 * Prototype : les pièces communes aux trois variantes — le panneau pleine largeur, l'art d'un
 * panneau et ses deux actions. Chaque variante reste libre de sa mise en page ; elle ne
 * partage que ça.
 */

/**
 * Le panneau pleine largeur : copie en haut au centre, art ancré en bas, échelle « hero ».
 * C'est le « header » de A et de C, avec la hauteur pour seule variable.
 */
export function PanneauHero({
  histoire,
  champ,
  premier = false,
  secondaire = false,
  hauteur = HAUTEUR_HERO,
}: {
  histoire: Histoire
  champ: Champ
  premier?: boolean
  secondaire?: boolean
  hauteur?: string
}) {
  const c = CHAMP[champ]
  return (
    <PanneauReveal
      premier={premier}
      className={cn("flex w-full flex-col text-center", c.panneau, hauteur)}
    >
      <div className="mx-auto flex w-full flex-col items-center px-6 pt-10 sm:pt-14">
        <h2 className={cn(TITRE_HERO, "font-semibold", APPARITION)}>
          {histoire.titre}
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
          {histoire.surtitre}
        </p>
        <p className={cn(CALLOUT, "mt-4", APPARITION, retard(2))}>
          {histoire.callout}
        </p>
        <div
          className={cn(
            "mt-[17px] flex flex-wrap items-center justify-center gap-x-[17px] gap-y-3",
            APPARITION,
            retard(3)
          )}
        >
          <BoutonPanneau href={histoire.href}>Acheter</BoutonPanneau>
          {secondaire ? (
            <LienChevron href="/produits" champ={champ}>
              Tout le catalogue
            </LienChevron>
          ) : null}
        </div>
      </div>
      <ArtPanneau
        image={histoire.produit.image}
        alt={histoire.titre}
        sizes="100vw"
        champ={champ}
        legende="photo produit · pleine largeur, recadrage bas"
      />
    </PanneauReveal>
  )
}

/**
 * L'art d'un panneau : la zone qui reste sous la copie, ancrée en bas, l'image recadrée par le
 * bas et centrée — la règle d'apple.com, sauf que la zone d'art s'arrête sous la copie au lieu
 * de la traverser : nos photos sont des photos produit, pas des visuels de campagne composés
 * autour du texte.
 *
 * Deux placements, pour trancher ici :
 *
 * - « pleine-largeur » : l'art traverse le panneau et se fait recadrer (`object-cover`) — la
 *   règle d'apple.com, taillée pour des visuels larges ;
 * - « cadre » : un cadre centré sous la copie, l'image tenue en entier (`object-contain`) — la
 *   règle qui convient à une photo produit détourée.
 *
 * Sans photo au catalogue (aujourd'hui : aucune), la zone montre sa règle de recadrage. Les
 * coins restent carrés : c'est le langage des panneaux, pas celui des Cartes produit.
 */
export function ArtPanneau({
  image,
  alt,
  sizes,
  champ,
  legende,
  index = 3,
  placement = "pleine-largeur",
}: {
  image: string | null
  alt: string
  sizes: string
  champ: Champ
  legende: string
  index?: number
  placement?: "pleine-largeur" | "cadre"
}) {
  const cadre = placement === "cadre"
  return (
    <div
      className={cn(
        "pointer-events-none relative flex min-h-[200px] w-full flex-1 items-stretch justify-center overflow-hidden px-3 pb-3",
        APPARITION_FONDU,
        retard(index)
      )}
    >
      {image ? (
        <div
          className={cn(
            "relative h-full",
            cadre ? "aspect-[4/3] max-w-full" : "w-full"
          )}
        >
          <Image
            src={image}
            alt={alt}
            fill
            sizes={sizes}
            className={cn(
              cadre ? "object-contain" : "object-cover object-bottom"
            )}
          />
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center justify-center border border-dashed",
            cadre ? "aspect-[4/3] max-w-full" : "w-full flex-1",
            CHAMP[champ].art
          )}
        >
          <span className="px-4 text-center text-xs">{legende}</span>
        </div>
      )}
    </div>
  )
}

/** L'action principale d'un panneau : la pilule bleue d'apple.com, sans transition au survol. */
export function BoutonPanneau({
  href,
  children,
  taille = "hero",
}: {
  href: string
  children: ReactNode
  taille?: "hero" | "promo"
}) {
  return (
    <Button
      render={<Link href={href} />}
      className={cn(
        taille === "hero"
          ? "h-[41px] rounded-full px-[22px] text-[17px] leading-[1.1765] tracking-[-0.022em] transition-none"
          : "h-[33px] rounded-full px-4 text-[14px] leading-[1.2858] tracking-[-0.016em] transition-none"
      )}
    >
      {children}
    </Button>
  )
}

/** L'action secondaire : le lien à chevron, souligné au survol, le chevron jamais souligné. */
export function LienChevron({
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
        "group/lien text-[17px] leading-[1.2354] tracking-[-0.022em] hover:underline",
        CHAMP[champ].lien,
        className
      )}
    >
      <span className="group-hover/lien:underline">{children}</span>
      <span aria-hidden="true"> ›</span>
    </Link>
  )
}
