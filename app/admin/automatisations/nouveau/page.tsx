import type { Metadata } from "next"

import { RegleAutomationForm } from "@/components/admin/regle-automation-form"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import { REGISTRE_STATUTS } from "@/lib/statut-de-commande"
import { enregistrerRegleAction } from "@/app/admin/automatisations/actions"

export const metadata: Metadata = {
  title: "Nouvelle règle",
}

const STATUTS = (Object.keys(REGISTRE_STATUTS) as OrderStatus[]).map(
  (valeur) => ({ valeur, libelle: REGISTRE_STATUTS[valeur].libellé })
)

export default function NouvelleReglePage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Nouvelle règle</h1>
        <p className="text-sm text-muted-foreground">
          Composez la Règle à partir du vocabulaire fermé : déclencheur,
          condition, action. Une combinaison impossible est refusée en la
          nommant.
        </p>
      </div>
      <RegleAutomationForm statuts={STATUTS} action={enregistrerRegleAction} />
    </div>
  )
}
