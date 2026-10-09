"use client"

import { Button } from "@/components/ui/button"
import type { ProduitLie } from "@/lib/use-cases/blog"

import { CarteProduit } from "./carte-produit"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

export function ProduitLieCarte({
  product,
  port,
}: {
  product: ProduitLie
  port?: PortMutationsDuPanier
}) {
  const { enAttente, messageRefus, ajoute, ajouter } =
    useMutationsDuPanier(port)

  function lancerAjout() {
    if (!product.varianteId || enAttente) return
    ajouter(product.varianteId, 1)
  }

  return (
    <CarteProduit
      product={product}
      action={
        <>
          <Button
            size="sm"
            variant="secondary"
            onClick={lancerAjout}
            disabled={!product.varianteId || enAttente}
            className="w-full rounded-full"
          >
            {enAttente ? "Ajout…" : "Ajouter au panier"}
          </Button>
          {ajoute ? (
            <p className="text-xs text-emerald-600">Ajouté au panier</p>
          ) : null}
          {messageRefus ? (
            <p role="alert" className="text-xs text-destructive">
              {messageRefus}
            </p>
          ) : null}
        </>
      }
    />
  )
}
