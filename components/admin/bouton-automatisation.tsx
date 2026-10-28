"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"

export interface EtatBoutonAutomatisation {
  error?: string
}

interface BoutonAutomatisationProps {
  action: (
    prevState: EtatBoutonAutomatisation,
    formData: FormData
  ) => Promise<EtatBoutonAutomatisation>
  champs: Record<string, string>
  libelle: string
  variante?: "default" | "outline" | "destructive" | "secondary"
}

/**
 * Un bouton de la surface des automatisations : basculer une Règle, réessayer
 * une Exécution. Le formulaire porte ses champs en hidden — aucune URL libre —
 * et le refus nommé revient sous le bouton.
 */
export function BoutonAutomatisation({
  action,
  champs,
  libelle,
  variante = "outline",
}: BoutonAutomatisationProps) {
  const [state, formAction, isPending] = useActionState(action, {})

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      {Object.entries(champs).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
      <Button type="submit" variant={variante} size="sm" disabled={isPending}>
        {isPending ? `${libelle}…` : libelle}
      </Button>
      {state.error ? (
        <p role="alert" className="max-w-64 text-end text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
