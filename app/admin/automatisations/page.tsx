import Link from "next/link"
import type { Metadata } from "next"

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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Automatisations</h1>
          <p className="text-sm text-muted-foreground">
            Chaque Règle se lit déclencheur → condition → action : elle décide
            ce qu&apos;un Événement exécute.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            render={<Link href="/admin/automatisations/executions" />}
          >
            Historique des exécutions
          </Button>
          <Button render={<Link href="/admin/automatisations/nouveau" />}>
            Nouvelle règle
          </Button>
        </div>
      </div>

      {enEchec > 0 ? (
        <p className="text-sm font-medium" role="status">
          {enEchec} exécution(s) en échec.{" "}
          <Link
            href="/admin/automatisations/executions?statut=echoue"
            className="underline"
          >
            Voir les échecs
          </Link>
        </p>
      ) : null}

      {regles.length === 0 ? (
        <p className="text-muted-foreground">
          Aucune Règle d&apos;automatisation. Une Règle dit quoi faire quand
          quelque chose arrive — par exemple envoyer l&apos;e-mail de
          confirmation quand une Commande est créée. Créez la première règle.
        </p>
      ) : (
        <Table>
          <TableHeader>
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
                      variant="outline"
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
      )}
    </div>
  )
}
