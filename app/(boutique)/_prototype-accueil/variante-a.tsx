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
import { ArtPanneau, BoutonPanneau, PanneauHero } from "./pieces"

/**
 * Variante A — « La pile » : l'anatomie d'apple.com transposée sans la réduire — un panneau
 * pleine largeur, puis une tuile noire pleine largeur, puis deux rangées 2-up, et la bande des
 * catégories pour finir. La copie pleine largeur tient l'échelle « hero » ; les tuiles
 * tiennent l'échelle « promo ».
 *
 * **Retenue le 14 octobre 2026** (#641), sans la bande de service : le pied de page dit déjà le
 * paiement à la livraison et la livraison partout au Maroc, et une troisième fois alourdissait
 * la fin de page. L'art est pleine largeur, recadré par le bas — le « cadre centré » de B est
 * refusé.
 *
 * Le catalogue ne porte que six histoires : Apple en a neuf. La pile est donc deux héros et
 * quatre tuiles, pas trois et six.
 */

export function VarianteA({ donnees }: { donnees: DonneesAccueil }) {
  const [premier, deuxieme, ...reste] = donnees.histoires
  const rangees = enRangees(reste, 2)

  return (
    <div className={cn("flex flex-col bg-background", GOUTTIERE)}>
      {premier ? (
        <PanneauHero histoire={premier} champ="muted" premier secondaire />
      ) : null}
      {deuxieme ? <PanneauHero histoire={deuxieme} champ="noir" /> : null}
      {rangees.map((rangee, rang) => (
        <div
          key={rangee.map((h) => h.produit.id).join("-")}
          className={cn("grid grid-cols-1 px-3 sm:grid-cols-2", GOUTTIERE)}
        >
          {rangee.map((histoire, index) => (
            <PanneauPromo
              key={histoire.produit.id}
              histoire={histoire}
              champ={
                rang % 2 === 0
                  ? "muted"
                  : (["muted", "noir"] as Champ[])[index]!
              }
            />
          ))}
        </div>
      ))}
      <BandeCategoriesTexte categories={donnees.categories} />
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

/** La tuile 2-up : échelle « promo », art ancré en bas. */
function PanneauPromo({
  histoire,
  champ,
}: {
  histoire: Histoire
  champ: Champ
}) {
  const c = CHAMP[champ]
  return (
    <PanneauReveal
      className={cn(
        "flex w-full flex-col text-center",
        c.panneau,
        HAUTEUR_PROMO
      )}
    >
      <div className="mx-auto flex min-h-[200px] w-full flex-col items-center px-5 pt-9 pb-4 sm:min-h-[225px] sm:pt-11 sm:pb-6">
        <h3 className={cn(TITRE_PROMO, "font-semibold", APPARITION)}>
          {histoire.titre}
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
        sizes="(min-width: 640px) 50vw, 100vw"
        champ={champ}
        legende="photo produit · recadrage bas, 2-up"
        index={4}
      />
    </PanneauReveal>
  )
}

/** La bande des catégories : six entrées de texte sur une ligne, la forme la plus économe. */
function BandeCategoriesTexte({
  categories,
}: {
  categories: DonneesAccueil["categories"]
}) {
  if (categories.length === 0) return null
  return (
    <PanneauReveal
      className={cn("w-full px-4 py-14 sm:px-6 sm:py-16", CHAMP.muted.panneau)}
    >
      <div className="mx-auto flex max-w-[980px] flex-col gap-10">
        <EnteteDeBande
          titre={BANDE_CATEGORIES.titre}
          surtitre={BANDE_CATEGORIES.surtitre}
          champ="muted"
        />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((categorie, index) => (
            <li
              key={categorie.id}
              className={cn(APPARITION, retard(index + 2))}
            >
              <Link
                href={`/categorie/${categorie.slug}`}
                className="group/tuile flex flex-col items-center gap-1 text-center"
              >
                <span className="text-[17px] leading-[1.2354] font-semibold tracking-[-0.022em]">
                  {categorie.name}
                </span>
                <span
                  className={cn(
                    "text-[14px] leading-[1.2858] tracking-[-0.016em]",
                    CHAMP.muted.second
                  )}
                >
                  {decompte(categorie)}
                </span>
                <span
                  className={cn(
                    "mt-1 text-[14px] leading-[1.2858] tracking-[-0.016em]",
                    CHAMP.muted.lien
                  )}
                >
                  <span className="group-hover/tuile:underline">
                    {BANDE_CATEGORIES.cta}
                  </span>
                  <span aria-hidden="true"> ›</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PanneauReveal>
  )
}
