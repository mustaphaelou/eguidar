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
import {
  MESSAGE_IMPORT_EN_COURS,
  MESSAGE_LOT_INTROUVABLE,
  etapeDuLot,
} from "@/lib/import-produits"
import {
  lireLeLot,
  lireLotEnCours,
  listerLesLots,
} from "@/lib/use-cases/import-produits"
import { BandeauLotEnCours } from "./bandeau-lot-en-cours"
import { EtapesImport } from "./etapes-import"
import { FormulaireImport } from "./formulaire-import"
import { HistoriqueImports } from "./historique-imports"
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
  const [lot, lotEnCours, lots] = await Promise.all([
    lotId === undefined ? Promise.resolve(null) : lireLeLot(lotId),
    lireLotEnCours(),
    listerLesLots(),
  ])
  const televersementIndisponible =
    lotEnCours === null ? null : MESSAGE_IMPORT_EN_COURS

  return (
    <div className="flex flex-col gap-6">
      <EtapesImport
        etapeCourante={lot === null ? "televerser" : etapeDuLot(lot.statut)}
      />

      {lotId !== undefined && lot === null ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {MESSAGE_LOT_INTROUVABLE}
        </p>
      ) : null}

      {lotEnCours !== null && lotId === undefined ? (
        <BandeauLotEnCours lot={lotEnCours} />
      ) : null}

      {lot !== null ? (
        <PanneauLotImport
          lot={lot}
          verificationAction={verifierLeLotAction}
          applicationAction={appliquerLeLotAction}
        />
      ) : null}

      <FormulaireImport
        action={televerserLeFichierAction}
        indisponible={televersementIndisponible}
      />

      <HistoriqueImports lots={lots} />
    </div>
  )
}
