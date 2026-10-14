import { Suspense } from "react"
import { connection } from "next/server"

import { BandeCategories } from "@/components/storefront/bande-categories"
import {
  GOUTTIERE_PANNEAUX,
  HAUTEUR_DUO,
  HAUTEUR_PLEINE_LARGEUR,
  PanneauDuo,
  PanneauPleineLargeur,
  type Champ,
} from "@/components/storefront/panneau-accueil"
import { parPaires, projeterPanneaux } from "@/lib/accueil-panneaux"
import { pageMetadata } from "@/lib/metadata"
import { getHomeData } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"

/**
 * L'accueil : une pile de panneaux, à la manière d'apple.com (#639, #641).
 *
 * Deux panneaux pleine largeur ouvrent la page — le premier sur le fond gris, le second sur le
 * noir qui sert d'accent — puis deux rangées de deux, et la bande des catégories ferme. Les
 * panneaux sont les Produits que l'Administration met en avant, dans `featuredOrder` ; leur
 * dessin et leur copie appartiennent au code (`lib/accueil-panneaux.ts`).
 */

export const metadata = pageMetadata({
  title: "Électronique au meilleur prix au Maroc",
  description:
    "Smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc. Prix en MAD, TVA 20% incluse, paiement à la livraison partout au Maroc.",
  path: "/",
})

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  )
}

async function HomeContent() {
  await connection()
  const donnees = await getHomeData()
  const [premier, deuxieme, ...suite] = projeterPanneaux(donnees.featured)
  const rangees = parPaires(suite)

  return (
    <div className={cn("flex flex-col bg-background", GOUTTIERE_PANNEAUX)}>
      {premier ? (
        <PanneauPleineLargeur
          panneau={premier}
          champ="muted"
          premier
          immediat
          lienCatalogue
        />
      ) : null}
      {deuxieme ? (
        <PanneauPleineLargeur panneau={deuxieme} champ="noir" />
      ) : null}
      {rangees.map((rangee, rang) => (
        <div
          key={rangee.map((panneau) => panneau.produit.id).join("-")}
          className={cn(
            "grid grid-cols-1 px-3 sm:grid-cols-2",
            GOUTTIERE_PANNEAUX
          )}
        >
          {rangee.map((panneau, index) => (
            <PanneauDuo
              key={panneau.produit.id}
              panneau={panneau}
              champ={champDeLaTuile(rang, index)}
            />
          ))}
        </div>
      ))}
      <BandeCategories categories={donnees.categories} />
    </div>
  )
}

/**
 * Le noir est une épice, pas un thème (#641) : le second panneau le porte, puis une tuile sur
 * deux rangées — la dernière — pour qu'il reste espacé quand le catalogue s'allonge.
 */
function champDeLaTuile(rang: number, index: number): Champ {
  return rang % 2 === 1 && index === 1 ? "noir" : "muted"
}

function HomeSkeleton() {
  return (
    <div className={cn("flex flex-col", GOUTTIERE_PANNEAUX)}>
      <div className={cn("animate-pulse bg-muted", HAUTEUR_PLEINE_LARGEUR)} />
      <div
        className={cn(
          "grid grid-cols-1 px-3 sm:grid-cols-2",
          GOUTTIERE_PANNEAUX
        )}
      >
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className={cn("animate-pulse bg-muted", HAUTEUR_DUO)}
          />
        ))}
      </div>
      <div className="h-80 animate-pulse bg-muted" />
    </div>
  )
}
