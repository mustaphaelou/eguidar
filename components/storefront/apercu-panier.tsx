import Image from "next/image"

import { Button } from "@/components/ui/button"
import { urlProduit } from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"
import { lirePanier } from "@/lib/panier"
import { lireSession } from "@/lib/use-cases/session-courante"

import { ID_TITRE_APERCU_DU_PANIER } from "./apercu-du-panier-identifiants"
import { LienQuiFermeLApercu } from "./lien-qui-ferme-l-apercu"

export async function ApercuPanier() {
  const [panier, client] = await Promise.all([lirePanier(), lireSession()])

  if (panier.lines.length === 0) {
    return (
      <section>
        <h2
          id={ID_TITRE_APERCU_DU_PANIER}
          className="text-xl font-semibold tracking-[0.007em]"
        >
          Votre panier est vide
        </h2>
        {client === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous pour retrouver le panier de votre compte.
          </p>
        ) : null}
      </section>
    )
  }

  return (
    <section>
      <h2
        id={ID_TITRE_APERCU_DU_PANIER}
        className="text-xl font-semibold tracking-[0.007em]"
      >
        Mon panier
      </h2>

      <ul className="mt-4">
        {panier.lines.map((article) => (
          <li
            key={article.variantId}
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
        className="mt-6 w-full sm:w-auto"
      >
        Voir le panier
      </Button>
    </section>
  )
}
