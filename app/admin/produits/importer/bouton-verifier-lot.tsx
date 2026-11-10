"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import type { MutationFormAction } from "@/lib/use-cases/mutation-actions"
import type { VerificationState } from "./actions"

/**
 * Le bouton de la Vérification du Lot. L'action renvoie un message français
 * quand le Lot ne peut pas être rejoué (déjà appliqué, en cours…) ; sinon elle
 * redirige vers le Lot vérifié.
 */
export function BoutonVerifierLot({
  lotId,
  action,
}: {
  lotId: string
  action: MutationFormAction<VerificationState>
}) {
  const [state, formAction, isPending] = useActionState(action, {})

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="lotId" value={lotId} />
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Vérification…" : "Vérifier le Lot"}
        </Button>
      </div>
    </form>
  )
}
