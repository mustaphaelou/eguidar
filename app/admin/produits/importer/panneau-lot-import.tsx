import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LIBELLES_STATUT_LOT_IMPORT } from "@/lib/import-produits"
import type { LotImportLu } from "@/lib/use-cases/import-produits"

const NOMBRE = new Intl.NumberFormat("fr-MA")
const DATE = new Intl.DateTimeFormat("fr-MA", {
  dateStyle: "long",
  timeStyle: "short",
})

function tailleEnOctets(taille: number): string {
  return `${NOMBRE.format(taille)} octet${taille > 1 ? "s" : ""}`
}

/**
 * Le Lot relu après un téléversement : son statut, son auteur, son instant,
 * l'empreinte de son fichier, sa taille et ses avertissements. À ce ticket le
 * Lot n'a pas encore de Ligne : la Vérification arrive avec les tickets
 * suivants.
 */
export function PanneauLotImport({ lot }: { lot: LotImportLu }) {
  const accepte = lot.statut === "brouillon"

  return (
    <Card aria-label="Lot d'import">
      <CardHeader>
        <CardTitle>Lot d&apos;import</CardTitle>
        <CardAction>
          <Badge variant={accepte ? "secondary" : "destructive"}>
            {LIBELLES_STATUT_LOT_IMPORT[lot.statut]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lot.motifEchec ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {lot.motifEchec}
          </p>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {accepte
            ? "Le fichier est accepté. La Vérification de ses Lignes sera disponible à l'étape suivante."
            : "Le fichier a été refusé : aucun Produit, aucune Variante et aucune Structure n'ont été écrits. Corrigez le fichier, puis téléversez-le de nouveau."}
        </p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Auteur</dt>
            <dd>
              {lot.auteur
                ? `${lot.auteur.name} (${lot.auteur.email})`
                : "Auteur inconnu"}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Téléversé le</dt>
            <dd>{DATE.format(lot.createdAt)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Taille du fichier</dt>
            <dd>{tailleEnOctets(lot.taille)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">Empreinte SHA-256</dt>
            <dd>
              <code className="text-xs break-all">{lot.empreinte}</code>
            </dd>
          </div>
        </dl>

        {lot.avertissements.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-medium">Avertissements</h2>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-muted-foreground">
              {lot.avertissements.map((avertissement, index) => (
                <li key={`${index}-${avertissement}`}>{avertissement}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
