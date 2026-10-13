import { Suspense } from "react"
import { connection } from "next/server"

import { pageMetadata } from "@/lib/metadata"
import { getHomeData } from "@/lib/use-cases/storefront"

import { donneesDepuis } from "./_prototype-accueil/panneaux"
import { SelecteurDeVariante } from "./_prototype-accueil/selecteur"
import { VarianteA } from "./_prototype-accueil/variante-a"
import { VarianteB } from "./_prototype-accueil/variante-b"
import { VarianteC } from "./_prototype-accueil/variante-c"
import {
  estCleVariante,
  VARIANTE_PAR_DEFAUT,
  type CleVariante,
} from "./_prototype-accueil/variantes"

/**
 * PROTOTYPE (#641) — la page d'accueil porte trois variantes de la mosaïque, commutées par
 * `?variant=A|B|C` depuis la barre de bas d'écran (`_prototype-accueil/`). Le contenu réel de
 * la page est inchangé par ailleurs : mêmes données, mêmes métadonnées.
 *
 * À jeter : la variante retenue sera réécrite proprement, le reste part sur la branche jetable.
 */

export const metadata = pageMetadata({
  title: "Électronique au meilleur prix au Maroc",
  description:
    "Smartphones, ordinateurs, TV, gaming et accessoires au meilleur prix au Maroc. Prix en MAD, TVA 20% incluse, paiement à la livraison partout au Maroc.",
  path: "/",
})

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>
}) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  )
}

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>
}) {
  await connection()
  const [{ variant }, donnees] = await Promise.all([
    searchParams,
    getHomeData(),
  ])
  const cle: CleVariante = estCleVariante(variant)
    ? variant
    : VARIANTE_PAR_DEFAUT
  const accueil = donneesDepuis(donnees)

  return (
    <>
      {cle === "A" ? <VarianteA donnees={accueil} /> : null}
      {cle === "B" ? <VarianteB donnees={accueil} /> : null}
      {cle === "C" ? <VarianteC donnees={accueil} /> : null}
      {process.env.NODE_ENV !== "production" ? (
        <SelecteurDeVariante courante={cle} />
      ) : null}
    </>
  )
}

function HomeSkeleton() {
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-10 px-4 py-6 sm:px-6">
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-80 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  )
}
