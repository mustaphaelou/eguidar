import { Badge } from "@/components/ui/badge"
import type { EtapeImport } from "@/lib/import-produits"
import { cn } from "@/lib/utils"

export const ETAPES_IMPORT = [
  {
    id: "televerser",
    libelle: "Téléverser",
    description: "Choisir le fichier CSV et juger son enveloppe.",
  },
  {
    id: "verifier",
    libelle: "Vérifier",
    description: "Contrôler ce que le fichier créerait ou modifierait.",
  },
  {
    id: "appliquer",
    libelle: "Appliquer",
    description: "Écrire ce qui a été vérifié, sans rien supprimer.",
  },
] as const

/**
 * Les trois étapes du parcours d'import. L'étape courante est portée par
 * `aria-current="step"` et par un badge visible, pour que la position se lise
 * à l'œil comme au lecteur d'écran.
 */
export function EtapesImport({
  etapeCourante,
}: {
  etapeCourante: EtapeImport
}) {
  return (
    <nav aria-label="Étapes de l'import">
      <ol className="grid gap-3 sm:grid-cols-3">
        {ETAPES_IMPORT.map((etape, index) => {
          const courante = etape.id === etapeCourante
          return (
            <li
              key={etape.id}
              aria-current={courante ? "step" : undefined}
              className={cn(
                "flex items-start gap-3 rounded-2xl p-4 ring-1 ring-foreground/10",
                courante ? "bg-card" : "bg-muted/40"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                  courante
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {index + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{etape.libelle}</span>
                  {courante ? (
                    <Badge variant="secondary">Étape en cours</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {etape.description}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
