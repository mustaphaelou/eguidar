import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  LIBELLES_STATUT_LOT_IMPORT,
  statutAfficheDuLot,
} from "@/lib/import-produits"
import type { LotImportListe } from "@/lib/use-cases/import-produits"

const DATE = new Intl.DateTimeFormat("fr-MA", {
  dateStyle: "medium",
  timeStyle: "short",
})

function Auteur({ auteur }: { auteur: LotImportListe["auteur"] }) {
  if (auteur === null) {
    return <span className="text-muted-foreground">Auteur inconnu</span>
  }
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{auteur.name}</span>
      <span className="truncate text-sm text-muted-foreground">
        {auteur.email}
      </span>
    </div>
  )
}

/**
 * L'historique des Lots passés : qui a importé quoi, quand, avec quel statut et
 * quels compteurs, du plus récent au plus ancien. Chaque ligne ouvre le rapport
 * du Lot, relu depuis la base.
 */
export function HistoriqueImports({
  lots,
}: {
  lots: readonly LotImportListe[]
}) {
  return (
    <section
      aria-label="Historique des imports"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">Historique des imports</h2>
        {lots.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {`${lots.length} Lot${lots.length > 1 ? "s" : ""}`}
          </span>
        ) : null}
      </div>

      {lots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun Lot d&apos;import n&apos;a encore été lancé : téléversez un
          fichier pour commencer.
        </p>
      ) : (
        <div className="overflow-clip rounded-xl border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Auteur</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Produits</TableHead>
                <TableHead>Écrits / indexés</TableHead>
                <TableHead className="text-end">Rapport</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell className="whitespace-nowrap">
                    {DATE.format(lot.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Auteur auteur={lot.auteur} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        lot.statut === "echoue" ? "destructive" : "secondary"
                      }
                    >
                      {LIBELLES_STATUT_LOT_IMPORT[statutAfficheDuLot(lot)]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      <span className="whitespace-nowrap">
                        Créés{" "}
                        <strong className="font-medium">
                          {lot.produitsCrees}
                        </strong>
                      </span>
                      <span className="whitespace-nowrap">
                        Modifiés{" "}
                        <strong className="font-medium">
                          {lot.produitsModifies}
                        </strong>
                      </span>
                      <span className="whitespace-nowrap">
                        Inchangés{" "}
                        <strong className="font-medium">
                          {lot.produitsInchanges}
                        </strong>
                      </span>
                      <span className="whitespace-nowrap">
                        Refusés{" "}
                        <strong className="font-medium">
                          {lot.produitsRefuses}
                        </strong>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span className="whitespace-nowrap">
                        Écrits{" "}
                        <strong className="font-medium">{lot.ecrits}</strong>
                      </span>
                      <span className="whitespace-nowrap">
                        Indexés{" "}
                        <strong className="font-medium">{lot.indexes}</strong>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-end">
                    <Link
                      href={`/admin/produits/importer?lot=${lot.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      Voir le rapport
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
