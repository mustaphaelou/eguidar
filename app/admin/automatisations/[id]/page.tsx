import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/layout/admin/page-header"
import { BoutonAutomatisation } from "@/components/admin/bouton-automatisation"
import { RegleAutomationForm } from "@/components/admin/regle-automation-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  LIBELLES_ACTION,
  LIBELLES_DECLENCHEUR,
  LIBELLES_STATUT_EXECUTION,
  libelleDeLaCondition,
} from "@/lib/automations/vocabulaire"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import { REGISTRE_STATUTS } from "@/lib/statut-de-commande"
import {
  lireRegle,
  listerEvenementsSimulables,
  simulerRegle,
} from "@/lib/use-cases/automatisations"
import { enregistrerRegleAction } from "@/app/admin/automatisations/actions"
import { basculerRegleAction } from "@/app/admin/automatisations/actions"

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
})

const STATUTS = (Object.keys(REGISTRE_STATUTS) as OrderStatus[]).map(
  (valeur) => ({ valeur, libelle: REGISTRE_STATUTS[valeur].libellé })
)

const BORDURE_CHAMP =
  "h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur
}

/**
 * Le résumé d'un instantané de révision : l'auteur est la seule attribution
 * que l'audit doit pouvoir relire, sans dépendre de la forme interne du JSON.
 */
function resumeDeLInstantane(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object")
    return "instantané indisponible"
  const faits = snapshot as Record<string, unknown>
  const declencheur =
    typeof faits.declencheur === "string" ? faits.declencheur : null
  const action = typeof faits.action === "string" ? faits.action : null
  return [faits.actif === true ? "active" : "inactive", declencheur, action]
    .filter((morceau): morceau is string => Boolean(morceau))
    .join(" · ")
}

export default async function AdminRegleAutomatisationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const regle = await lireRegle(id)
  if (!regle) notFound()

  const demandes = await searchParams
  const evenements = await listerEvenementsSimulables(regle.id)
  const demande = premier(demandes.simuler)
  const selectionne =
    evenements.find((evenement) => evenement.id === demande) ??
    evenements[0] ??
    null
  const decision = selectionne
    ? await simulerRegle({
        regleId: regle.id,
        evenementId: selectionne.id,
      })
    : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Modifier — ${regle.nom}`}
        description={
          <>
            {LIBELLES_DECLENCHEUR[regle.declencheur]} →{" "}
            {libelleDeLaCondition(regle.condition.type)} →{" "}
            {LIBELLES_ACTION[regle.action]}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              render={<Link href="/admin/automatisations" />}
            >
              Retour aux règles
            </Button>
            <BoutonAutomatisation
              action={basculerRegleAction}
              champs={{
                regleId: regle.id,
                actif: regle.actif ? "non" : "actif",
                retour: "regle",
              }}
              libelle={regle.actif ? "Désactiver" : "Activer"}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant={regle.actif ? "secondary" : "outline"}>
          {regle.actif ? "Actif" : "Inactif"}
        </Badge>
        <span className="text-muted-foreground">
          Dernière exécution :{" "}
          {regle.derniereExecution
            ? `${LIBELLES_STATUT_EXECUTION[regle.derniereExecution.statut]} · ${formatDate.format(regle.derniereExecution.debut)}`
            : "jamais"}
        </span>
      </div>

      <RegleAutomationForm
        regle={regle}
        statuts={STATUTS}
        action={enregistrerRegleAction}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Simulation</h2>
        {!selectionne || !decision ? (
          <p className="text-muted-foreground">
            Aucun Événement réel pour «{" "}
            {LIBELLES_DECLENCHEUR[regle.declencheur]} ». La simulation attend un
            fait venu d&apos;une mutation.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Évalue la Règle sur un Événement réel : rien n&apos;est écrit,
              rien n&apos;est envoyé.
            </p>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label htmlFor="simuler" className="text-sm font-medium">
                Événement réel
              </label>
              <select
                id="simuler"
                name="simuler"
                defaultValue={selectionne.id}
                className={BORDURE_CHAMP}
              >
                {evenements.map((evenement) => (
                  <option key={evenement.id} value={evenement.id}>
                    {evenement.entityId} —{" "}
                    {formatDate.format(evenement.occurredAt)} —{" "}
                    {LIBELLES_STATUT_EXECUTION[evenement.statut]}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="sm">
                Simuler
              </Button>
            </form>
            <p
              role="status"
              data-decision={decision.decision}
              className={
                decision.decision === "enverrait"
                  ? "text-sm font-medium"
                  : "text-sm font-medium text-muted-foreground"
              }
            >
              {decision.decision === "enverrait"
                ? "Enverrait :"
                : "Ignorerait :"}{" "}
              {decision.motif}
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Audit des révisions</h2>
        {regle.revisions.length === 0 ? (
          <p className="text-muted-foreground">
            Aucune révision : la Règle vient d&apos;être créée.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {regle.revisions.map((revision) => (
              <li key={revision.id} className="flex flex-wrap gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDate.format(revision.horodatage)}
                </span>
                <span>{revision.auteur}</span>
                <span className="text-muted-foreground">
                  {resumeDeLInstantane(revision.snapshot)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
