"use client"

import Image from "next/image"
import { useEffect, useState, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import { urlProduit } from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"
import type { ApercuDuPanier } from "@/lib/panier-transport"

import { ID_TITRE_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { SqueletteDeLApercu } from "./apercu-du-panier-squelette"
import { LienQuiFermeLApercu } from "./lien-qui-ferme-l-apercu"
import { lireLApercuDuPanier } from "./lecture-du-panier-http"
import { MonCompteDansLApercu } from "./mon-compte-dans-l-apercu"
import { usePanierQuiChange } from "./panier-qui-change"

export function ApercuPanier() {
  const version = usePanierQuiChange()
  const [apercu, setApercu] = useState<ApercuDuPanier | null>(null)

  useEffect(() => {
    const controleur = new AbortController()
    void lireLApercuDuPanier(controleur.signal).then((corps) => {
      if (corps === null || controleur.signal.aborted) return
      setApercu(corps)
    })
    return () => controleur.abort()
  }, [version])

  if (apercu === null) return <SqueletteDeLApercu />

  if (apercu.etat === "vide") {
    return (
      <>
        <section>
          <h2
            id={ID_TITRE_APERCU_DU_PANIER}
            className="text-xl font-semibold tracking-[0.007em]"
          >
            Votre panier est vide
          </h2>
          {apercu.connecte ? null : (
            <p className="mt-2 text-sm text-muted-foreground">
              Connectez-vous pour retrouver le panier de votre compte.
            </p>
          )}
        </section>
        <MonCompteDansLApercu connecte={apercu.connecte} />
      </>
    )
  }

  return (
    <>
      <section>
        <h2
          id={ID_TITRE_APERCU_DU_PANIER}
          className="text-xl font-semibold tracking-[0.007em]"
        >
          Mon panier
        </h2>

        <ul className="mt-4">
          {apercu.lignes.map((article, rang) => (
            <li
              // La réponse HTTP ne porte pas de variantId : le couple
              // produit + variante est le fait stable qui identifie la ligne.
              key={`${article.productSlug}\u0000${article.variantName}`}
              data-slot="apercu-du-panier-ligne"
              style={{ "--rang-ligne": rang } as CSSProperties}
              className="flex items-center gap-4 border-b py-4 last:border-b-0"
            >
              <LienQuiFermeLApercu
                href={urlProduit(article.productSlug)}
                className="shrink-0"
              >
                {article.image ? (
                  <Image
                    src={article.image}
                    alt={article.productName}
                    width={64}
                    height={64}
                    sizes="64px"
                    className="size-16 rounded-xl bg-muted object-cover"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-xl bg-muted text-center text-xs text-muted-foreground">
                    Aucune image
                  </div>
                )}
              </LienQuiFermeLApercu>

              <div className="min-w-0 flex-1">
                <LienQuiFermeLApercu
                  href={urlProduit(article.productSlug)}
                  className="line-clamp-2 text-sm font-medium transition-colors hover:text-primary"
                >
                  {article.productName}
                </LienQuiFermeLApercu>
                <p className="text-xs text-muted-foreground">
                  {article.variantName}
                </p>
                {article.quantity > 1 ? (
                  <p className="text-xs text-muted-foreground">
                    {`${article.quantity} × ${formatPrice(article.unitPrice)}`}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <Button
          render={<LienQuiFermeLApercu href="/panier" />}
          className="mt-6 w-full lg:w-auto"
        >
          Voir le panier
        </Button>
      </section>
      <MonCompteDansLApercu connecte={apercu.connecte} />
    </>
  )
}
