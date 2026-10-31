import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/admin/page-header"
import { RegleAutomationForm } from "@/components/admin/regle-automation-form"
import { Button } from "@/components/ui/button"
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
      <PageHeader
        title="Nouvelle règle"
        description="Composez la Règle à partir du vocabulaire fermé : déclencheur, condition, action. Une combinaison impossible est refusée en la nommant."
        actions={
          <Button
            variant="outline"
            render={<Link href="/admin/automatisations" />}
          >
            Retour aux règles
          </Button>
        }
      />
      <RegleAutomationForm statuts={STATUTS} action={enregistrerRegleAction} />
    </div>
  )
}
