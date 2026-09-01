"use client"

import { Button } from "@/components/ui/button"
import { MESSAGE_CAP_ATTEINTE } from "@/lib/panier-visiteur"
import { cn } from "@/lib/utils"

import type { EtatAjoutAuPanier } from "./use-ajout-au-panier"

export function BarreDAchat({
  visible,
  etat,
}: {
  visible: boolean
  etat: EtatAjoutAuPanier
}) {
  const {
    prix,
    ajouter,
    enAttente = false,
    ajoute = false,
    capAtteint = false,
    desactive = false,
    variantNom,
  } = etat

  return (
    <div
      data-slot="barre-d-achat"
      inert={!visible}
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/75 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none sm:px-6 lg:hidden",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0"
      )}
    >
      <div className="mx-auto flex w-full max-w-[980px] items-center justify-between gap-4">
        <p className="text-[28px] font-semibold">{prix}</p>
        <div className="flex flex-col items-end gap-1">
          <Button
            size="xl"
            disabled={desactive}
            onClick={ajouter}
            aria-label={
              variantNom ? `Ajouter au panier — ${variantNom}` : undefined
            }
            className="rounded-full text-[17px]"
          >
            {enAttente ? "Ajout…" : "Ajouter au panier"}
          </Button>
          {ajoute && (
            <p className="text-sm text-emerald-600">Ajouté au panier</p>
          )}
          {capAtteint && (
            <p role="alert" className="text-sm text-destructive">
              {MESSAGE_CAP_ATTEINTE}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
