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
import { useGlissementRetrait } from "./use-glissement-retrait"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

/** Sous ce déplacement, un appui sur un pas reste un appui. */
const SEUIL_APPUI_PX = 10

interface Appui {
  pointerId: number
  /** La quantité visée par cet appui, déjà prévisualisée. */
  cible: number
  /** La quantité affichée avant l'appui, à laquelle un appui annulé revient. */
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
  /** La ligne part : le panier peut annoncer le retrait. */
  onRetire?(article: ArticleDuPanierDonnees): void
  /** Le retrait a été refusé : la ligne est revenue. */
  onRetour?(article: ArticleDuPanierDonnees): void
}) {
  const { enAttente, messageRefus, modifier, retirer } =
    useMutationsDuPanier(port)

  // La quantité affichée ne doit rien au serveur : elle suit l'appui. Les
  // écritures sont absolues, donc elles se coalescent — une seule en vol,
  // toujours la dernière voulue.
  const [quantiteVoulue, setQuantiteVoulue] = useState<number | null>(null)
  const quantiteAffichee = quantiteVoulue ?? article.quantity
  const enVol = useRef(false)
  const voulueEnAttente = useRef<number | null>(null)
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

  function ecrire(cible: number) {
    enVol.current = true
    modifier(article.variantId, cible, (resultat) => {
      if (!resultat.ok) {
        // Le refus a déjà sa voix dans le seam : le numéro revient au serveur.
        enVol.current = false
        voulueEnAttente.current = null
        setQuantiteVoulue(null)
        return
      }
      const suivante = voulueEnAttente.current
      if (suivante !== null) {
        voulueEnAttente.current = null
        ecrire(suivante)
        return
      }
      enVol.current = false
    })
  }

  function viser(cible: number) {
    if (cible < 1) return
    setQuantiteVoulue(cible)
    if (enVol.current) {
      voulueEnAttente.current = cible
      return
    }
    ecrire(cible)
  }

  function lancerRetrait() {
    if (partie) return
    setPartie(true)
    retirer(article.variantId, (resultat) => {
      if (resultat.ok) return
      // Le retrait est refusé : la ligne revient à sa place.
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
        </div>

        <p className="w-24 text-right text-sm font-bold">
          {formatPrice(article.unitPrice * quantiteAffichee)}
        </p>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-full text-muted-foreground hover:text-destructive"
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

      {messageRefus ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageRefus}
        </p>
      ) : null}
    </li>
  )
}
