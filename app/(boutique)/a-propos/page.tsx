import type { Metadata } from "next"
import Link from "next/link"

import {
  DeliveryTruck02Icon,
  Money01Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Découvrez eguidar.ma, la boutique d'électronique en ligne au Maroc : prix en MAD avec TVA incluse, paiement à la livraison et livraison partout au Maroc.",
}

const values = [
  {
    icon: Money01Icon,
    title: "Prix en MAD, TVA incluse",
    text: "Tous nos prix sont affichés en dirhams, TVA 20% comprise. Pas de surprise au moment de payer.",
  },
  {
    icon: DeliveryTruck02Icon,
    title: "Livraison partout au Maroc",
    text: "Nous livrons dans les principales villes du Royaume, avec des frais clairs par ville et la livraison offerte dès un certain montant.",
  },
  {
    icon: Shield01Icon,
    title: "Paiement à la livraison",
    text: "Vous ne payez qu'à la réception de votre colis, en espèces, directement au livreur. Commandez en toute confiance.",
  },
]

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">À propos de {site.legalName}</h1>
      <p className="mt-3 text-muted-foreground">
        {site.name} est une boutique en ligne marocaine spécialisée dans
        l&apos;électronique : smartphones, ordinateurs, téléviseurs, gaming,
        accessoires et bien plus.
      </p>

      <div className="mt-10 flex flex-col gap-6">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Notre mission</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Rendre l&apos;électronique de qualité accessible à tous les
            Marocains, au meilleur prix et sans prise de risque. C&apos;est
            pourquoi nous misons sur le paiement à la livraison, des prix tout
            compris (TVA 20% incluse) et une livraison rapide dans tout le pays.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Chaque produit de notre catalogue est sélectionné avec soin : nous
            vérifions les fournisseurs, les stocks et la conformité pour vous
            garantir un achat serein, du passage de commande jusqu&apos;à la
            remise de votre colis.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Nos engagements</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {values.map((value) => (
              <div key={value.title} className="rounded-2xl border p-5">
                <HugeiconsIcon
                  icon={value.icon}
                  strokeWidth={2}
                  className="size-6 text-primary"
                />
                <h3 className="mt-3 font-semibold">{value.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {value.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-muted/40 p-6">
          <h2 className="text-lg font-semibold">Une question ?</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Notre équipe vous répond par e-mail, téléphone ou WhatsApp.
            Consultez aussi notre FAQ et nos conditions de livraison.
          </p>
          <p className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link
              href="/contact"
              className="font-medium text-primary hover:underline"
            >
              Nous contacter
            </Link>
            <Link
              href="/faq"
              className="font-medium text-primary hover:underline"
            >
              FAQ
            </Link>
            <Link
              href="/conditions"
              className="font-medium text-primary hover:underline"
            >
              Conditions &amp; livraison
            </Link>
          </p>
        </section>
      </div>
    </div>
  )
}
