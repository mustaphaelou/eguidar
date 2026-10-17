"use client"

import Image from "next/image"
import Link from "next/link"
import { useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

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
import { useEcritureEnVol } from "./use-ecriture-en-vol"
import { useGlissementRetrait } from "./use-glissement-retrait"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

const SEUIL_APPUI_PX = 10

interface Appui {
  pointerId: number
  cible: number
  avant: number
  departX: number
  departY: number
  annule: boolean
}

export function ArticleDuPanier({
  article,
  port,
  onRetire,
  onRetour,
}: {
  article: ArticleDuPanierDonnees
  port?: PortMutationsDuPanier
  onRetire?(article: ArticleDuPanierDonnees): void
  onRetour?(article: ArticleDuPanierDonnees): void
}) {
  const { enAttente, messageRefus, modifier, retirer } =
    useMutationsDuPanier(port)

  const [quantiteVoulue, setQuantiteVoulue] = useState<number | null>(null)
  const quantiteAffichee = quantiteVoulue ?? article.quantity
  const ecrire = useEcritureEnVol({
    envoyer: (cible, surFin) =>
      modifier(article.variantId, cible, (resultat) => surFin(resultat.ok)),
    surRefus: () => setQuantiteVoulue(null),
  })
  const appuiRef = useRef<Appui | null>(null)

  const [partie, setPartie] = useState(false)

  const {
    ref: refLigne,
    gestes,
    sortir,
    restaurer,
  } = useGlissementRetrait<HTMLLIElement>({
    onRetirer: () => lancerRetrait(),
  })

  function viser(cible: number) {
    if (cible < 1) return
    setQuantiteVoulue(cible)
    ecrire(cible)
  }

  function lancerRetrait() {
    if (partie) return
    setPartie(true)
    retirer(article.variantId, (resultat) => {
      if (resultat.ok) return
      setPartie(false)
      restaurer()
      onRetour?.(article)
    })
    onRetire?.(article)
  }

  function appuyer(event: ReactPointerEvent<HTMLButtonElement>, pas: number) {
    if (partie) return
    const avant = quantiteAffichee
    const cible = avant + pas
    if (cible < 1) return
    appuiRef.current = {
      pointerId: event.pointerId,
      cible,
      avant,
      departX: event.clientX,
      departY: event.clientY,
      annule: false,
    }
    setQuantiteVoulue(cible)
  }

  function suivreAppui(event: ReactPointerEvent<HTMLButtonElement>) {
    const appui = appuiRef.current
    if (!appui || event.pointerId !== appui.pointerId) return
    const distance = Math.hypot(
      event.clientX - appui.departX,
      event.clientY - appui.departY
    )
    const annule = distance > SEUIL_APPUI_PX
    if (annule === appui.annule) return
    appui.annule = annule
    setQuantiteVoulue(annule ? appui.avant : appui.cible)
  }

  function relacherAppui(event: ReactPointerEvent<HTMLButtonElement>) {
    const appui = appuiRef.current
    if (appui?.pointerId === event.pointerId && appui.annule) {
      appuiRef.current = null
    }
  }

  function activer(pas: number) {
    if (partie) return
    const appui = appuiRef.current
    appuiRef.current = null
    const cible = appui && !appui.annule ? appui.cible : quantiteAffichee + pas
    viser(cible)
  }

  return (
    <li
      ref={refLigne}
      {...gestes}
      className="touch-pan-y border-b py-4 select-none last:border-b-0"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
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
            <p className="text-xs text-muted-foreground">
              {article.variantName}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatPrice(article.unitPrice)} / unité
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
            aria-label="Retirer du panier"
            disabled={enAttente || partie}
            onClick={() => {
              if (enAttente || partie) return
              sortir()
            }}
          >
            <HugeiconsIcon icon={DeleteThrowIcon} strokeWidth={2} />
          </Button>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full disabled:active:scale-100 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none"
            aria-label="Diminuer la quantité"
            disabled={partie || quantiteAffichee <= 1}
            onPointerDown={(event) => appuyer(event, -1)}
            onPointerMove={suivreAppui}
            onPointerUp={relacherAppui}
            onPointerCancel={relacherAppui}
            onClick={() => activer(-1)}
          >
            <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2} />
          </Button>
          <span className="w-8 text-center text-sm font-semibold">
            {quantiteAffichee}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-full disabled:active:scale-100 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none"
            aria-label="Augmenter la quantité"
            disabled={partie}
            onPointerDown={(event) => appuyer(event, 1)}
            onPointerMove={suivreAppui}
            onPointerUp={relacherAppui}
            onPointerCancel={relacherAppui}
            onClick={() => activer(1)}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </Button>
          <p className="ms-auto text-sm font-bold sm:ms-2 sm:w-28 sm:text-right">
            {formatPrice(article.unitPrice * quantiteAffichee)}
          </p>
        </div>
      </div>

      {messageRefus ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageRefus}
        </p>
      ) : null}
    </li>
  )
}
