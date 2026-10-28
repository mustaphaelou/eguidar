import type { Metadata } from "next"

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
  listerExecutions,
  type ExecutionAutomatisation,
} from "@/lib/automations/historique"
import type { StatutAutomation } from "@/lib/generated/prisma/client"

export const metadata: Metadata = {
  title: "Automatisations",
}

const LIBELLES_STATUT: Record<StatutAutomation, string> = {
  en_attente: "En attente",
  en_cours: "En cours",
  reussi: "Réussi",
  echoue: "Échoué",
  ignore: "Ignoré",
  mort: "File morte",
}

const LIBELLES_DECLENCHEUR: Record<
  ExecutionAutomatisation["declencheur"],
  string
> = {
  evenement: "Événement",
  planification: "Planification",
  manuel: "Manuel",
}

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
})

function horodatage(date: Date | null): string {
  return date ? formatDate.format(date) : "—"
}

/**
 * La lecture minimale de l'historique des automatisations (ADR-0041) : un
 * échec doit être visible avec son erreur et son nombre de tentatives. Phase 5
 * possède la surface complète (édition des règles, relance manuelle).
 */
export default async function AdminAutomatisationsPage() {
  const executions = await listerExecutions({ limite: 25 })
  const enEchec = executions.filter(
    (execution) => execution.statut === "echoue" || execution.statut === "mort"
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Automatisations</h1>
        <p className="text-sm text-muted-foreground">
          Les effets des mutations sont rejoués par le travailleur durable. Un
          événement expiré est ignoré, jamais échoué.
        </p>
      </div>

      {enEchec.length > 0 ? (
        <p className="text-sm font-medium" role="status">
          {enEchec.length} exécution(s) en échec ou en file morte.
        </p>
      ) : null}

      {executions.length === 0 ? (
        <p className="text-muted-foreground">
          Aucune exécution pour le moment. Les effets des prochaines mutations
          apparaîtront ici.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Statut</TableHead>
              <TableHead>Règle</TableHead>
              <TableHead>Événement</TableHead>
              <TableHead>Tentative</TableHead>
              <TableHead>Erreur</TableHead>
              <TableHead>Début</TableHead>
              <TableHead>Fin</TableHead>
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
                    {LIBELLES_STATUT[execution.statut]}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {execution.regle ?? execution.action}
                </TableCell>
                <TableCell>
                  {execution.evenement
                    ? `${execution.evenement.type} — ${execution.evenement.entityId}`
                    : LIBELLES_DECLENCHEUR[execution.declencheur]}
                </TableCell>
                <TableCell>{execution.tentative}</TableCell>
                <TableCell className="max-w-64 text-sm break-words">
                  {execution.erreur ?? "—"}
                </TableCell>
                <TableCell>{horodatage(execution.debut)}</TableCell>
                <TableCell>{horodatage(execution.fin)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
