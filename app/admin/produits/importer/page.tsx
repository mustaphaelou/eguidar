import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { PageHeader } from "@/components/layout/admin/page-header"
import { Button } from "@/components/ui/button"
import {
  appliquerLeLotAction,
  televerserLeFichierAction,
  verifierLeLotAction,
} from "@/app/admin/produits/importer/actions"
import { lireLeLot } from "@/lib/use-cases/import-produits"
import { EtapesImport } from "./etapes-import"
import { FormulaireImport } from "./formulaire-import"
import { PanneauLotImport } from "./panneau-lot-import"

export const metadata: Metadata = {
  title: "Importer des produits",
}

type RawSearchParams = Record<string, string | string[] | undefined>

function premierParametre(
  valeur: string | string[] | undefined
): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur
}

export default function ImportProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Importer des produits"
        description="Téléverser un fichier, vérifier ce qu'il ferait, puis appliquer."
        actions={
          <>
            <Button
              variant="outline"
              render={<a href="/api/admin/produits/importer/modele" download />}
            >
              Télécharger le modèle
            </Button>
            <Button variant="outline" render={<Link href="/admin/produits" />}>
              Retour aux produits
            </Button>
          </>
        }
      />

      <EtapesImport etapeCourante="televerser" />

      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-2xl bg-muted" />}
      >
        <ImportContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  )
}

async function ImportContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<RawSearchParams>
}) {
  const raw = await searchParamsPromise
  const lotId = premierParametre(raw.lot)
  const lot = lotId === undefined ? null : await lireLeLot(lotId)

  return (
    <div className="flex flex-col gap-6">
      {lotId !== undefined && lot === null ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Ce Lot d&apos;import est introuvable.
        </p>
      ) : null}

      {lot !== null ? (
        <PanneauLotImport
          lot={lot}
          verificationAction={verifierLeLotAction}
          applicationAction={appliquerLeLotAction}
        />
      ) : null}

      <FormulaireImport action={televerserLeFichierAction} />
    </div>
  )
}
