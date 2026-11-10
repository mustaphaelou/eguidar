import Link from "next/link"

import { Button } from "@/components/ui/button"
import type { LotEnCoursImport } from "@/lib/use-cases/import-produits"

/**
 * Le rappel d'un Lot en cours quand la page n'en ouvre aucun : l'onglet a pu
 * être fermé, mais le Lot, son curseur et ses Lignes restent en base. La
 * reprise se fait par le panneau du Lot, jamais par un nouveau téléversement.
 */
export function BandeauLotEnCours({ lot }: { lot: LotEnCoursImport }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <p>
        Un import est en cours… Reprenez-le pour le terminer : les Produits déjà
        écrits restent, l&apos;application continue au curseur.
      </p>
      <Button
        variant="outline"
        render={<Link href={`/admin/produits/importer?lot=${lot.id}`} />}
      >
        Reprendre
      </Button>
    </div>
  )
}
