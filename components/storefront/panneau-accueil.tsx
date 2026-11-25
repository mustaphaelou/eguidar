import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import { ApparitionPanneau } from "@/components/storefront/apparition-panneau"
import { Button } from "@/components/ui/button"
import { APPARITION, APPARITION_FONDU, retard } from "@/lib/apparition"
import type { PanneauProduit } from "@/lib/accueil-panneaux"
import { cn } from "@/lib/utils"

export const TITRE_HERO = "text-titre-hero"

export const SURTITRE_HERO = "text-surtitre-hero"

export const TITRE_PROMO = "text-titre-promo"

export const SURTITRE_PROMO = "text-surtitre-promo"

export const CALLOUT = "text-callout tabular-nums"

export const HAUTEUR_PLEINE_LARGEUR =
  "min-block-[clamp(29.5rem,18rem+36vw,46rem)]"

export const HAUTEUR_DUO = "min-block-[clamp(29.5rem,24rem+12vw,34.5rem)]"

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
    second: "text-encre-sombre-secondaire",
    lien: "text-link-sombre",
  },
}

function ArtDuPanneau({
  panneau,
  sizes,
  immediat = false,
  index = 3,
  pleineLargeur = false,
  melangeSurFond = false,
}: {
  panneau: PanneauProduit
  sizes: string
  immediat?: boolean
  index?: number
  pleineLargeur?: boolean
  melangeSurFond?: boolean
}) {
  if (!panneau.produit.image) return null

  return (
    <div
      className={cn(
        "pointer-events-none relative w-full flex-1 overflow-clip min-block-[200px]",
        APPARITION_FONDU,
        retard(index)
      )}
    >
      <div className="absolute inset-x-3 inset-bs-0 inset-be-3">
        <Image
          src={panneau.produit.image}
          alt={panneau.titre}
          fill
          sizes={sizes}
          loading={immediat ? "eager" : undefined}
          className={cn(
            "object-cover object-bottom motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover/panneau:scale-[1.02]",
            pleineLargeur && "lg:object-contain lg:object-center",
            pleineLargeur && melangeSurFond && "lg:mix-blend-multiply"
          )}
        />
      </div>
    </div>
  )
}

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
        "rounded-full motion-safe:active:scale-[0.97]",
        taille === "hero"
          ? "px-6 text-body leading-none tracking-[-0.022em] min-block-11"
          : "zone-tactile px-4 text-sm leading-none tracking-[-0.016em] min-block-9"
      )}
    >
      <span className="etiquette-centree">Acheter</span>
    </Button>
  )
}

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
        "group/lien zone-tactile inline-flex items-center gap-1 text-body leading-[1.2354] tracking-[-0.022em] transition-opacity duration-150 ease-out active:opacity-70",
        CHAMP[champ].lien,
        className
      )}
    >
      <span className="[@media(hover:hover)_and_(pointer:fine)]:group-hover/lien:underline">
        {children}
      </span>
      <span
        aria-hidden="true"
        className="inline-block motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover/lien:translate-x-0.5"
      >
        ›
      </span>
    </Link>
  )
}

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
  const Titre = premier ? "h1" : "h2"
  const avecImage = Boolean(panneau.produit.image)

  return (
    <ApparitionPanneau
      premier={premier}
      className={cn(
        "panneau-cliquable flex w-full flex-col gap-6 overflow-clip text-center",
        c.panneau,
        HAUTEUR_PLEINE_LARGEUR,
        !avecImage && "justify-center"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col items-center gap-3 px-6",
          avecImage
            ? "pbs-[clamp(2.5rem,1.5rem+2.5vw,3.5rem)]"
            : "py-[clamp(2.5rem,1.5rem+2.5vw,3.5rem)]"
        )}
      >
        <Titre className={cn(TITRE_HERO, "font-semibold", APPARITION)}>
          <Link href={panneau.href} className="panneau-lien">
            {panneau.titre}
          </Link>
        </Titre>
        <p
          className={cn(
            SURTITRE_HERO,
            c.second,
            "max-w-[44ch]",
            APPARITION,
            retard(1)
          )}
        >
          {panneau.surtitre}
        </p>
        <p className={cn(CALLOUT, APPARITION, retard(2))}>{panneau.callout}</p>
        <div
          className={cn(
            "mbs-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-3",
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
      <ArtDuPanneau
        panneau={panneau}
        sizes="(min-width: 1024px) 700px, 100vw"
        immediat={immediat}
        pleineLargeur
        melangeSurFond={champ !== "noir"}
      />
    </ApparitionPanneau>
  )
}

export function PanneauDuo({
  panneau,
  champ,
}: {
  panneau: PanneauProduit
  champ: Champ
}) {
  const c = CHAMP[champ]
  const avecImage = Boolean(panneau.produit.image)

  return (
    <ApparitionPanneau
      className={cn(
        "panneau-cliquable flex w-full flex-col gap-5 overflow-clip text-center",
        c.panneau,
        HAUTEUR_DUO,
        !avecImage && "justify-center"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col items-center gap-2.5 px-5",
          avecImage
            ? "pbs-[clamp(2rem,1.5rem+1.5vw,2.75rem)]"
            : "py-[clamp(2rem,1.5rem+1.5vw,2.75rem)]"
        )}
      >
        <h3 className={cn(TITRE_PROMO, "font-semibold", APPARITION)}>
          <Link href={panneau.href} className="panneau-lien">
            {panneau.titre}
          </Link>
        </h3>
        <p
          className={cn(
            SURTITRE_PROMO,
            c.second,
            "max-w-[36ch]",
            APPARITION,
            retard(1)
          )}
        >
          {panneau.surtitre}
        </p>
        <p className={cn(CALLOUT, APPARITION, retard(2))}>{panneau.callout}</p>
        <div className={cn("mbs-1", APPARITION, retard(3))}>
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
