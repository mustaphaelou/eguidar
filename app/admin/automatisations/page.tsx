import Link from "next/link"
import type { Metadata } from "next"

import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon, Robot01Icon } from "@hugeicons/core-free-icons"

import { BoutonAutomatisation } from "@/components/admin/bouton-automatisation"
import { EmptyState } from "@/components/admin/empty-state"
import { PageHeader } from "@/components/layout/admin/page-header"
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
import { compterExecutionsEnEchec } from "@/lib/automations/historique"
import {
  LIBELLES_ACTION,
  LIBELLES_DECLENCHEUR,
  LIBELLES_DECLENCHEUR_EXECUTION,
  LIBELLES_STATUT_EXECUTION,
  libelleDeLaCondition,
} from "@/lib/automations/vocabulaire"
import { listerRegles } from "@/lib/use-cases/automatisations"
import { basculerRegleAction } from "@/app/admin/automatisations/actions"

export const metadata: Metadata = {
  title: "Automatisations",
}

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
})

/**
 * La liste des Règles : chacune se lit déclencheur → condition → action, avec
 * son état et sa dernière exécution. Une Règle désactivée reste visible ; un
 * échec ne se cache pas.
 */
export default async function AdminAutomatisationsPage() {
  const [regles, enEchec] = await Promise.all([
    listerRegles(),
    compterExecutionsEnEchec(),
  ])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Automatisations"
        description="Chaque Règle se lit déclencheur → condition → action : elle décide ce qu’un Événement exécute."
        actions={
          <>
            <Button
              variant="outline"
              render={<Link href="/admin/automatisations/executions" />}
            >
              Historique des exécutions
            </Button>
            <Button render={<Link href="/admin/automatisations/nouveau" />}>
              Nouvelle règle
            </Button>
          </>
        }
      />

      {enEchec > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="font-medium">
            {enEchec} exécution{enEchec > 1 ? "s" : ""} en échec.
          </span>
          <Link
            href="/admin/automatisations/executions?statut=echoue"
            className="font-medium underline underline-offset-4"
          >
            Voir les échecs
          </Link>
        </div>
      ) : null}

      {regles.length === 0 ? (
        <EmptyState
          icon={
            <HugeiconsIcon
              icon={Robot01Icon}
              strokeWidth={2}
              className="size-5"
            />
          }
          title="Aucune Règle d'automatisation."
          description="Une Règle dit quoi faire quand quelque chose arrive — par exemple envoyer l’e-mail de confirmation quand une Commande est créée."
          action={
            <Button render={<Link href="/admin/automatisations/nouveau" />}>
              Créer la première règle
            </Button>
          }
          className="py-14"
        />
      ) : (
        <div className="overflow-clip rounded-xl border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Règle</TableHead>
                <TableHead>Déclencheur → condition → action</TableHead>
                <TableHead>État</TableHead>
                <TableHead>Dernière exécution</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {regles.map((regle) => (
                <TableRow key={regle.id}>
                  <TableCell className="font-medium">{regle.nom}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      <span>
                        {LIBELLES_DECLENCHEUR[regle.declencheur]} →{" "}
                        {libelleDeLaCondition(regle.condition.type)} →{" "}
                        {LIBELLES_ACTION[regle.action]}
                      </span>
                      {regle.configuration ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          destinataire :{" "}
                          {regle.configuration.destinataireVariable}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={regle.actif ? "secondary" : "outline"}>
                      {regle.actif ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {regle.derniereExecution ? (
                      <div className="flex flex-col text-sm">
                        <span>
                          {
                            LIBELLES_STATUT_EXECUTION[
                              regle.derniereExecution.statut
                            ]
                          }
                        </span>
                        <span className="text-muted-foreground">
                          {formatDate.format(regle.derniereExecution.debut)} ·{" "}
                          {
                            LIBELLES_DECLENCHEUR_EXECUTION[
                              regle.derniereExecution.declencheur
                            ]
                          }
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Jamais
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        render={
                          <Link href={`/admin/automatisations/${regle.id}`} />
                        }
                      >
                        Modifier
                      </Button>
                      <BoutonAutomatisation
                        action={basculerRegleAction}
                        champs={{
                          regleId: regle.id,
                          actif: regle.actif ? "non" : "actif",
                          retour: "liste",
                        }}
                        libelle={regle.actif ? "Désactiver" : "Activer"}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
