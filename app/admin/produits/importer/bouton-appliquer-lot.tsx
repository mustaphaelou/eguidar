"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  MESSAGE_INDEXATION_EN_ATTENTE,
  PRODUITS_PAR_APPLICATION_IMPORT,
  type EchecProduitApplication,
} from "@/lib/import-produits"
import type { MutationFormAction } from "@/lib/use-cases/mutation-actions"
import type { ApplicationState } from "./actions"

const NOMBRE = new Intl.NumberFormat("fr-MA")

/** Le nombre de reprises automatiques quand seule l'indexation reste en retard. */
const MAX_REPRISES_INDEXATION = 3

export interface BoutonAppliquerLotProps {
  lotId: string
  curseurInitial: number
  ecritsInitiaux: number
  indexesInitiaux: number
  total: number
  /** Le Lot est déjà `en_cours` : l'appel est une reprise, même avant tout Produit. */
  reprise?: boolean
  action: MutationFormAction<ApplicationState>
}

interface Progression {
  curseur: number
  ecrits: number
  indexes: number
}

/**
 * Le bouton Appliquer : il enchaîne les appels bornés de 25 Produits tant que
 * le curseur n'a pas atteint la fin, puis il insiste quelques fois quand seule
 * l'indexation est en retard. À chaque appel, le curseur rendu par l'action est
 * la seule reprise possible — la page ne devine jamais où elle en est.
 */
export function BoutonAppliquerLot({
  lotId,
  curseurInitial,
  ecritsInitiaux,
  indexesInitiaux,
  total,
  reprise = false,
  action,
}: BoutonAppliquerLotProps) {
  const router = useRouter()
  const [enCours, setEnCours] = React.useState(false)
  const [erreur, setErreur] = React.useState<string | null>(null)
  const [progression, setProgression] = React.useState<Progression>({
    curseur: curseurInitial,
    ecrits: ecritsInitiaux,
    indexes: indexesInitiaux,
  })
  const [echecs, setEchecs] = React.useState<EchecProduitApplication[]>([])
  const [indexationEnAttente, setIndexationEnAttente] = React.useState(
    indexesInitiaux < ecritsInitiaux
  )

  async function appliquer() {
    setEnCours(true)
    setErreur(null)
    setEchecs([])

    let curseur = curseurInitial
    let reprises = 0
    const appelsMaximum =
      Math.ceil(total / PRODUITS_PAR_APPLICATION_IMPORT) +
      MAX_REPRISES_INDEXATION +
      1

    try {
      for (let appel = 0; appel < appelsMaximum; appel += 1) {
        const formData = new FormData()
        formData.set("lotId", lotId)
        formData.set("curseur", String(curseur))
        const reponse = await action({}, formData)

        if (reponse.error) {
          setErreur(reponse.error)
          break
        }
        const resultat = reponse as ApplicationState

        curseur = resultat.curseurSuivant ?? curseur
        setProgression({
          curseur,
          ecrits: resultat.ecrits ?? 0,
          indexes: resultat.indexes ?? 0,
        })
        setEchecs((precedents) => [...precedents, ...(resultat.echecs ?? [])])
        setIndexationEnAttente(resultat.indexationEnAttente === true)

        if (resultat.statut === "partiel" || resultat.statut === "termine") {
          break
        }
        if ((resultat.reste ?? 0) > 0) {
          reprises = 0
          continue
        }
        if (resultat.indexationEnAttente !== true) break

        reprises += 1
        if (reprises >= MAX_REPRISES_INDEXATION) break
      }
    } catch (error) {
      setErreur(error instanceof Error ? error.message : String(error))
    } finally {
      setEnCours(false)
      router.refresh()
    }
  }

  const curseurAffiche = Math.min(progression.curseur, total)

  return (
    <div className="flex flex-col gap-3">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm"
      >
        <span className="font-medium">
          {`Application : ${NOMBRE.format(curseurAffiche)} / ${NOMBRE.format(total)} Produits`}
        </span>
        <span className="text-muted-foreground">
          {`Produits écrits : ${NOMBRE.format(progression.ecrits)}`}
        </span>
        <span className="text-muted-foreground">
          {`Produits indexés : ${NOMBRE.format(progression.indexes)}`}
        </span>
      </div>

      {indexationEnAttente ? (
        <p
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          {MESSAGE_INDEXATION_EN_ATTENTE}
        </p>
      ) : null}

      {erreur !== null ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {erreur}
        </p>
      ) : null}

      {echecs.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-destructive">
          {echecs.map((echec) => (
            <li key={echec.slug}>
              {`Produit ${echec.slug} en échec : ${echec.motif}`}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <Button type="button" onClick={appliquer} disabled={enCours}>
          {enCours
            ? "Application…"
            : reprise || curseurInitial > 0
              ? "Reprendre l'application"
              : "Appliquer le Lot"}
        </Button>
      </div>
    </div>
  )
}
