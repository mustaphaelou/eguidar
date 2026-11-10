"use client"

import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LIMITE_OCTETS_IMPORT, messageDuRefus } from "@/lib/import-produits"

export interface TeleversementState {
  error?: string
}

interface FormulaireImportProps {
  action: (
    precedent: TeleversementState,
    formData: FormData
  ) => Promise<TeleversementState | { error: string }>
}

const MESSAGE_TROP_GROS = messageDuRefus({ code: "fichier_trop_gros" })

/**
 * Le formulaire de téléversement. La taille est vérifiée dans le navigateur
 * avant l'envoi : au-delà de 5 Mo, la requête dépasserait aussi la limite de
 * corps de 6 Mo des actions serveur, et l'administrateur lirait une erreur du
 * framework au lieu du message du contrat.
 */
export function FormulaireImport({ action }: FormulaireImportProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const [erreurDeTaille, setErreurDeTaille] = useState<string | null>(null)

  function verifierLaTaille(event: React.ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0]
    setErreurDeTaille(
      fichier !== undefined && fichier.size > LIMITE_OCTETS_IMPORT
        ? MESSAGE_TROP_GROS
        : null
    )
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (erreurDeTaille !== null) event.preventDefault()
      }}
      className="flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/10"
    >
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {erreurDeTaille ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {erreurDeTaille}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="fichier">Fichier CSV</Label>
        <Input
          id="fichier"
          name="fichier"
          type="file"
          accept=".csv,text/csv"
          required
          aria-describedby="fichier-aide"
          onChange={verifierLaTaille}
        />
        <p id="fichier-aide" className="text-sm text-muted-foreground">
          Un fichier UTF-8 de 5 Mo au plus, avec les neuf colonnes du modèle.
          Les cellules vides laissent les valeurs existantes intactes.
        </p>
      </div>

      <div>
        <Button type="submit" disabled={isPending || erreurDeTaille !== null}>
          {isPending ? "Téléversement…" : "Téléverser le fichier"}
        </Button>
      </div>
    </form>
  )
}
