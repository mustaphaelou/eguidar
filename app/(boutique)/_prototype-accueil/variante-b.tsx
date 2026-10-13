import Link from "next/link"

import { cn } from "@/lib/utils"

import { EnteteDeBande } from "./bandes"
import {
  CALLOUT,
  CHAMP,
  GOUTTIERE,
  HAUTEUR_PROMO,
  SURTITRE_PROMO,
  TITRE_PROMO,
  type Champ,
} from "./echelles"
import { APPARITION, retard } from "./apparition"
import { PanneauReveal } from "./mouvement"
import {
  BANDE_CATEGORIES,
  decompte,
  type DonneesAccueil,
  type Histoire,
} from "./panneaux"
import { ArtPanneau, BoutonPanneau } from "./pieces"

/**
 * Variante B — « Le mur » : aucune hiérarchie. Les six histoires ont le même poids — trois
 * rangées 2-up, à l'échelle « promo » — et les catégories forment trois rangées de tuiles
 * compactes, plus loin. Pas de héros pleine largeur, pas de bande de service : le pied de page
 * porte déjà le paiement et la livraison.
 *
 * Le noir reste une épice : deux tuiles sur six, aux positions 2 et 5, comme chez Apple.
 */

export function VarianteB({ donnees }: { donnees: DonneesAccueil }) {
  const rangees = enRangees(donnees.histoires, 2)
  const champs: Champ[][] = [
    ["muted", "noir"],
    ["muted", "muted"],
    ["noir", "muted"],
  ]

  return (
    <div className={cn("flex flex-col bg-background", GOUTTIERE)}>
      {rangees.map((rangee, rang) => (
        <div
          key={rangee.map((h) => h.produit.id).join("-")}
          className={cn("grid grid-cols-1 px-3 sm:grid-cols-2", GOUTTIERE)}
        >
          {rangee.map((histoire, index) => (
            <TuileProduit
              key={histoire.produit.id}
              histoire={histoire}
              champ={champs[rang]?.[index] ?? "muted"}
              premier={rang === 0}
            />
          ))}
        </div>
      ))}
      <BandeCategoriesTuiles categories={donnees.categories} />
    </div>
  )
}

function enRangees(histoires: Histoire[], taille: number): Histoire[][] {
  const rangees: Histoire[][] = []
  for (let i = 0; i < histoires.length; i += taille) {
    rangees.push(histoires.slice(i, i + taille))
  }
  return rangees
}

function TuileProduit({
  histoire,
  champ,
  premier,
}: {
  histoire: Histoire
  champ: Champ
  premier: boolean
}) {
  const c = CHAMP[champ]
  return (
    <PanneauReveal
      premier={premier}
      className={cn(
        "flex w-full flex-col text-center",
        c.panneau,
        HAUTEUR_PROMO
      )}
    >
      <div className="mx-auto flex min-h-[200px] w-full flex-col items-center px-5 pt-9 pb-4 sm:min-h-[225px] sm:pt-11 sm:pb-6">
        <h2 className={cn(TITRE_PROMO, "font-semibold", APPARITION)}>
          {histoire.titre}
        </h2>
        <p
          className={cn(
            SURTITRE_PROMO,
            c.second,
            "mt-2",
            APPARITION,
            retard(1)
          )}
        >
          {histoire.surtitre}
        </p>
        <p className={cn(CALLOUT, "mt-3", APPARITION, retard(2))}>
          {histoire.callout}
        </p>
        <div className={cn("mt-3", APPARITION, retard(3))}>
          <BoutonPanneau href={histoire.href} taille="promo">
            Acheter
          </BoutonPanneau>
        </div>
      </div>
      <ArtPanneau
        image={histoire.produit.image}
        alt={histoire.titre}
        sizes="(min-width: 640px) 40vw, 80vw"
        champ={champ}
        legende="photo produit · cadre centré, produit entier"
        index={4}
        placement="cadre"
      />
    </PanneauReveal>
  )
}

/**
 * La bande des catégories en tuiles : la même forme que les tuiles produit — 2-up, même
 * échelle — mais sans art, et plus basse.
 */
function BandeCategoriesTuiles({
  categories,
}: {
  categories: DonneesAccueil["categories"]
}) {
  if (categories.length === 0) return null
  return (
    <>
      <PanneauReveal
        className={cn("w-full px-4 py-14 sm:px-6", CHAMP.muted.panneau)}
      >
        <EnteteDeBande
          titre={BANDE_CATEGORIES.titre}
          surtitre={BANDE_CATEGORIES.surtitre}
          champ="muted"
        />
      </PanneauReveal>
      <div className={cn("grid grid-cols-1 px-3 sm:grid-cols-2", GOUTTIERE)}>
        {categories.map((categorie, index) => (
          <PanneauReveal
            key={categorie.id}
            className={cn(
              "flex min-h-[240px] w-full flex-col items-center justify-center px-6 py-10 text-center",
              CHAMP.muted.panneau
            )}
          >
            <Link
              href={`/categorie/${categorie.slug}`}
              className={cn(
                "group/tuile flex w-full flex-col items-center",
                APPARITION,
                retard(index)
              )}
            >
              <span
                className={cn(
                  "text-[24px] leading-[1.15] font-semibold tracking-[0.002em] sm:text-[28px]"
                )}
              >
                {categorie.name}
              </span>
              <span
                className={cn(
                  "mt-1.5 text-[14px] leading-[1.2858] tracking-[-0.016em]",
                  CHAMP.muted.second
                )}
              >
                {decompte(categorie)}
              </span>
              <span
                className={cn(
                  "mt-3 text-[14px] leading-[1.2858] tracking-[-0.016em]",
                  CHAMP.muted.lien
                )}
              >
                <span className="group-hover/tuile:underline">
                  {BANDE_CATEGORIES.cta}
                </span>
                <span aria-hidden="true"> ›</span>
              </span>
            </Link>
          </PanneauReveal>
        ))}
      </div>
    </>
  )
}
