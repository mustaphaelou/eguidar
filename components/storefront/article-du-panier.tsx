"use client"

import Image from "next/image"
import Link from "next/link"

import {
  Add01Icon,
  DeleteThrowIcon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"
import { urlProduit } from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"
import type { ArticleDuPanier as ArticleDuPanierDonnees } from "@/lib/panier"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

export function ArticleDuPanier({
  article,
  port,
}: {
  article: ArticleDuPanierDonnees
  port?: PortMutationsDuPanier
}) {
  const { enAttente, messageRefus, modifier, retirer } =
    useMutationsDuPanier(port)

  function setQuantity(quantity: number) {
    if (quantity < 1) return
    modifier(article.variantId, quantity)
  }

  function remove() {
    retirer(article.variantId)
  }

  return (
    <li className="border-b py-4 last:border-b-0">
      <div className="flex items-center gap-4">
        <Link href={urlProduit(article.productSlug)} className="shrink-0">
          <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-muted">
            {article.image ? (
              <Image
                src={article.image}
                alt={article.productName}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Aucune image
              </div>
            )}
          </div>
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={urlProduit(article.productSlug)}
            className="line-clamp-2 text-sm font-medium transition-colors hover:text-primary"
          >
            {article.productName}
          </Link>
          <p className="text-xs text-muted-foreground">{article.variantName}</p>
          <p className="text-xs text-muted-foreground">
            {formatPrice(article.unitPrice)} / unité
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Diminuer la quantité"
            disabled={enAttente || article.quantity <= 1}
            onClick={() => setQuantity(article.quantity - 1)}
          >
            <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
          </Button>
          <span className="w-8 text-center text-sm font-semibold">
            {article.quantity}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Augmenter la quantité"
            disabled={enAttente}
            onClick={() => setQuantity(article.quantity + 1)}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </Button>
        </div>

        <p className="w-24 text-right text-sm font-bold">
          {formatPrice(article.lineTotal)}
        </p>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full text-muted-foreground hover:text-destructive"
          aria-label="Retirer du panier"
          disabled={enAttente}
          onClick={remove}
        >
          <HugeiconsIcon icon={DeleteThrowIcon} strokeWidth={2} />
        </Button>
      </div>

      {messageRefus ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageRefus}
        </p>
      ) : null}
    </li>
  )
}
