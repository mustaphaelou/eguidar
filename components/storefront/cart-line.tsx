"use client"

import { useTransition } from "react"
import Image from "next/image"
import Link from "next/link"

import {
  Add01Icon,
  DeleteThrowIcon,
  MinusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  modifierQuantiteArticlePanierAction,
  retirerArticleDuPanierAction,
} from "@/app/(boutique)/actions"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/money"
import type { ArticleDuPanier } from "@/lib/panier"

export function LigneArticlePanier({ line }: { line: ArticleDuPanier }) {
  const [isPending, startTransition] = useTransition()

  function setQuantity(quantity: number) {
    if (quantity < 1) return
    startTransition(async () => {
      await modifierQuantiteArticlePanierAction(line.articlePanierId, quantity)
    })
  }

  function remove() {
    startTransition(async () => {
      await retirerArticleDuPanierAction(line.articlePanierId)
    })
  }

  return (
    <li className="flex items-center gap-4 border-b py-4 last:border-b-0">
      <Link href={`/produit/${line.productSlug}`} className="shrink-0">
        <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-muted">
          {line.image ? (
            <Image
              src={line.image}
              alt={line.productName}
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
          href={`/produit/${line.productSlug}`}
          className="line-clamp-2 text-sm font-medium transition-colors hover:text-primary"
        >
          {line.productName}
        </Link>
        <p className="text-xs text-muted-foreground">{line.variantName}</p>
        <p className="text-xs text-muted-foreground">
          {formatPrice(line.unitPrice)} / unité
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-full"
          aria-label="Diminuer la quantité"
          disabled={isPending || line.quantity <= 1}
          onClick={() => setQuantity(line.quantity - 1)}
        >
          <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
        </Button>
        <span className="w-8 text-center text-sm font-semibold">
          {line.quantity}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-full"
          aria-label="Augmenter la quantité"
          disabled={isPending}
          onClick={() => setQuantity(line.quantity + 1)}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </Button>
      </div>

      <p className="w-24 text-right text-sm font-bold">
        {formatPrice(line.lineTotal)}
      </p>

      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-full text-muted-foreground hover:text-destructive"
        aria-label="Retirer du panier"
        disabled={isPending}
        onClick={remove}
      >
        <HugeiconsIcon icon={DeleteThrowIcon} strokeWidth={2} />
      </Button>
    </li>
  )
}
