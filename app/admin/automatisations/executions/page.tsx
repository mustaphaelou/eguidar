import Link from "next/link"
import type { Metadata } from "next"
import { Suspense } from "react"

import { BoutonAutomatisation } from "@/components/admin/bouton-automatisation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { listerExecutions } from "@/lib/automations/historique"
import {
  LIBELLES_DECLENCHEUR_EXECUTION,
  LIBELLES_STATUT_EXECUTION,
} from "@/lib/automations/vocabulaire"
import {
  parseFiltresExecutions,
  STATUTS_EXECUTION,
} from "@/lib/automatisations-listing"
import { listerRegles } from "@/lib/use-cases/automatisations"
import { reessayerExecutionAction } from "@/app/admin/automatisations/actions"

export const metadata: Metadata = {
  title: "Historique des automatisations",
}

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
})

const BORDURE_CHAMP =
  "h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

function horodatage(date: Date | null): string {
  return date ? formatDate.format(date) : "—"
}

function valeurDuJour(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : ""
}

export default function AdminExecutionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Historique des exécutions</h1>
          <p className="text-sm text-muted-foreground">
            Statut, tentative, erreur et horodatages de chaque Exécution. Une
            Exécution réessayée est marquée « Manuel » ; l&apos;historique est
            conservé quatorze jours.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link href="/admin/automatisations" />}
        >
          Retour aux règles
        </Button>
      </div>

      <Suspense fallback={<p className="text-muted-foreground">Chargement…</p>}>
        <ExecutionsContent searchParamsPromise={searchParams} />
      </Suspense>
    </div>
  )
}

async function ExecutionsContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtres = parseFiltresExecutions(await searchParamsPromise)
  const [executions, regles] = await Promise.all([
    listerExecutions({ ...filtres, limite: 50 }),
    listerRegles(),
  ])
  const filtresDuRetour = {
    statut: filtres.statut ?? "",
    regle: filtres.regleId ?? "",
    depuis: valeurDuJour(filtres.depuis),
  }
  const aDesFiltres = Boolean(
    filtres.statut ?? filtres.regleId ?? filtres.depuis
  )

  return (
    <>
      <form
        method="get"
        className="flex flex-wrap items-end gap-2"
        aria-label="Filtres"
      >
        <select
          name="statut"
          aria-label="Statut"
          defaultValue={filtres.statut ?? ""}
          className={BORDURE_CHAMP}
        >
          <option value="">Tous les statuts</option>
          {STATUTS_EXECUTION.map((statut) => (
            <option key={statut} value={statut}>
              {LIBELLES_STATUT_EXECUTION[statut]}
            </option>
          ))}
        </select>
        <select
          name="regle"
          aria-label="Règle"
          defaultValue={filtres.regleId ?? ""}
          className={BORDURE_CHAMP}
        >
          <option value="">Toutes les règles</option>
          {regles.map((regle) => (
            <option key={regle.id} value={regle.id}>
              {regle.nom}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="depuis"
          aria-label="Depuis"
          defaultValue={valeurDuJour(filtres.depuis)}
          className={BORDURE_CHAMP}
        />
        <Button type="submit" variant="outline" size="sm">
          Filtrer
        </Button>
        {aDesFiltres ? (
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/automatisations/executions" />}
          >
            Réinitialiser
          </Button>
        ) : null}
      </form>

      {executions.length === 0 ? (
        <p className="text-muted-foreground">
          Aucune exécution pour ces filtres. Les effets des prochaines mutations
          apparaîtront ici.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Statut</TableHead>
              <TableHead>Règle</TableHead>
              <TableHead>Événement</TableHead>
              <TableHead>Déclencheur</TableHead>
              <TableHead>Tentative</TableHead>
              <TableHead>Erreur</TableHead>
              <TableHead>Début</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead className="text-end">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executions.map((execution) => (
              <TableRow key={execution.id}>
                <TableCell>
                  <Badge
                    variant={
                      execution.statut === "echoue" ||
                      execution.statut === "mort"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {LIBELLES_STATUT_EXECUTION[execution.statut]}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {execution.regle ?? execution.action}
                </TableCell>
                <TableCell>
                  {execution.evenement
                    ? `${execution.evenement.type} — ${execution.evenement.entityId}`
                    : "—"}
                </TableCell>
                <TableCell>
                  {LIBELLES_DECLENCHEUR_EXECUTION[execution.declencheur]}
                </TableCell>
                <TableCell>{execution.tentative}</TableCell>
                <TableCell className="max-w-64 text-sm break-words">
                  {execution.erreur ?? "—"}
                </TableCell>
                <TableCell>{horodatage(execution.debut)}</TableCell>
                <TableCell>{horodatage(execution.fin)}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {execution.statut === "echoue" ? (
                      <BoutonAutomatisation
                        action={reessayerExecutionAction}
                        champs={{
                          executionId: execution.id,
                          ...filtresDuRetour,
                        }}
                        libelle="Réessayer"
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
