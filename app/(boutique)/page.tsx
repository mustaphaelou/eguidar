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
              champ={champDuPanneauDuo(rang, index)}
            />
          ))}
        </div>
      ))}
      <BandeCategories categories={donnees.categories} />
    </div>
  )
}

function champDuPanneauDuo(rang: number, index: number): Champ {
  return rang % 2 === 1 && index === 1 ? "noir" : "muted"
}

function HomeSkeleton() {
  return (
    <div className={cn("flex flex-col", GOUTTIERE_PANNEAUX)}>
      <div className={cn("animate-pulse bg-muted", HAUTEUR_PLEINE_LARGEUR)} />
      <div className={cn("animate-pulse bg-muted", HAUTEUR_PLEINE_LARGEUR)} />
      {Array.from({ length: 2 }).map((_, rang) => (
        <div
          key={rang}
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
      ))}
      <div className="h-80 animate-pulse bg-muted" />
    </div>
  )
}
