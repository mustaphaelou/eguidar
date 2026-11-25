"use client"

import { Button } from "@/components/ui/button"
import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { cn } from "@/lib/utils"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

export type FaitsAffichageBarre = {
  varianteId: string
  prix: string
  variantNom?: string
  indisponible?: boolean
}

export function BarreDAchat({
  visible,
  faits,
  port,
}: {
  visible: boolean
  faits: FaitsAffichageBarre
  port?: PortMutationsDuPanier
}) {
  const { enAttente, messageRefus, ajoute, ajouter } =
    useMutationsDuPanier(port)

  const { varianteId, prix, variantNom, indisponible = false } = faits

  function lancerAjout() {
    if (!varianteId || indisponible || enAttente) return
    ajouter(varianteId, 1)
  }

  return (
    <div
      data-slot="barre-d-achat"
      inert={!visible}
      aria-hidden={!visible}
      className={cn(
        "voile-depoli fixed inset-x-0 inset-be-0 z-40 border-bs border-hairline pbs-3 pbe-[max(1rem,env(safe-area-inset-bottom))] transition-opacity duration-200 ease-out [--voile-depoli-opacite:86%] motion-safe:transition-[opacity,transform] lg:hidden",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none opacity-0 motion-safe:translate-y-full"
      )}
    >
      <div
        className={cn(
          CONTENEUR_BOUTIQUE,
          "flex items-center justify-between gap-3"
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-prix-barre font-semibold whitespace-nowrap tabular-nums">
            {prix}
          </p>
          {variantNom ? (
            <p className="truncate text-xs text-muted-foreground">
              {variantNom}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button
            size="xl"
            variant={indisponible ? "secondary" : "default"}
            disabled={indisponible || enAttente}
            onClick={lancerAjout}
            aria-label={
              indisponible
                ? variantNom
                  ? `Produit indisponible — ${variantNom}`
                  : "Produit indisponible"
                : variantNom
                  ? `Ajouter au panier — ${variantNom}`
                  : undefined
            }
            className="rounded-full px-5 text-body min-block-11 motion-safe:active:scale-[0.97]"
          >
            {enAttente ? (
              "Ajout…"
            ) : indisponible ? (
              <span>Indisponible</span>
            ) : (
              <>
                <span>Ajouter</span>
                <span className="max-sm:sr-only"> au panier</span>
              </>
            )}
          </Button>
          {ajoute && (
            <p role="status" className="text-xs font-medium text-succes">
              Ajouté au panier
            </p>
          )}
          {messageRefus && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {messageRefus}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
