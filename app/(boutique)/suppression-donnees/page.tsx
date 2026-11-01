import type { Metadata } from "next"
import { Suspense } from "react"

import { CheckmarkCircle01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { pageMetadata } from "@/lib/metadata"

export const metadata: Metadata = pageMetadata({
  title: "Suppression des données",
  description:
    "Confirmation de la suppression des données d'un Compte client eguidar.com demandée depuis Facebook.",
  path: "/suppression-donnees",
  noindex: true,
})

type SearchParams = {
  code?: string | string[] | undefined
}

export default function SuppressionDonneesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
      <HugeiconsIcon
        icon={CheckmarkCircle01Icon}
        strokeWidth={2}
        className="size-14 text-emerald-600"
      />
      <h1 className="text-2xl font-bold sm:text-3xl">
        Suppression des données confirmée
      </h1>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        La demande de suppression des données de votre Compte client eguidar.com
        a bien été traitée. Si des données étaient rattachées à ce compte
        Facebook, elles ont été supprimées, y compris vos Commandes.
      </p>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">
            Code de confirmation en cours de lecture…
          </p>
        }
      >
        <CodeDeConfirmation searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function CodeDeConfirmation({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { code } = await searchParams
  const brut = Array.isArray(code) ? code[0] : code
  const confirmationCode =
    typeof brut === "string" && /^[0-9a-zA-Z-]{1,64}$/.test(brut) ? brut : null

  if (!confirmationCode) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun code de confirmation n&apos;est fourni.
      </p>
    )
  }

  return (
    <p className="rounded-2xl bg-muted/40 px-6 py-4 text-sm">
      Code de confirmation :{" "}
      <code className="font-mono text-base font-semibold">
        {confirmationCode}
      </code>
    </p>
  )
}
