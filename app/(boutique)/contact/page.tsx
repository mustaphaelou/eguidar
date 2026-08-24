import type { Metadata } from "next"
import Link from "next/link"

import {
  Clock01Icon,
  Mail01Icon,
  MessageQuestionIcon,
  TelephoneIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contactez eguidar.com par e-mail, téléphone ou WhatsApp. Notre équipe répond rapidement à toutes vos questions sur vos commandes et livraisons.",
}

const whatsappUrl = `https://wa.me/${site.contactPhoneDigits}?text=${encodeURIComponent(site.whatsappMessage)}`
const phoneUrl = `tel:+${site.contactPhoneDigits}`

const channels = [
  {
    icon: WhatsappIcon,
    title: "WhatsApp",
    value: site.contactPhone,
    href: whatsappUrl,
    note: "Le plus rapide — réponse en quelques minutes.",
  },
  {
    icon: TelephoneIcon,
    title: "Téléphone",
    value: site.contactPhone,
    href: phoneUrl,
    note: "Du lundi au samedi, de 9h à 19h.",
  },
  {
    icon: Mail01Icon,
    title: "E-mail",
    value: site.contactEmail,
    href: `mailto:${site.contactEmail}`,
    note: "Réponse sous 24h ouvrées.",
  },
]

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">Contactez-nous</h1>
      <p className="mt-3 text-muted-foreground">
        Une question sur un produit, une commande ou une livraison ? Choisissez
        le canal qui vous convient, nous vous répondons rapidement.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {channels.map((channel) => (
          <Link
            key={channel.title}
            href={channel.href}
            className="group flex flex-col gap-3 rounded-2xl border p-5 transition-colors hover:border-ring"
          >
            <HugeiconsIcon
              icon={channel.icon}
              strokeWidth={2}
              className="size-7 text-primary"
            />
            <div>
              <p className="font-semibold">{channel.title}</p>
              <p className="mt-1 text-sm font-medium break-all group-hover:underline">
                {channel.value}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {channel.note}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <HugeiconsIcon
            icon={MessageQuestionIcon}
            strokeWidth={2}
            className="size-5 text-primary"
          />
          Avant de nous écrire
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          La plupart des questions trouvent leur réponse dans notre FAQ : suivi
          de commande, paiement à la livraison, frais de livraison et retours.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            href="/faq"
            className="font-medium text-primary hover:underline"
          >
            Consulter la FAQ
          </Link>
          <Link
            href="/conditions"
            className="font-medium text-primary hover:underline"
          >
            Conditions &amp; livraison
          </Link>
        </div>
      </section>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon
          icon={Clock01Icon}
          strokeWidth={2}
          className="mt-0.5 size-4 shrink-0"
        />
        Pour les questions liées à une commande en cours, pensez à mentionner
        son numéro (ex. : #A1B2C3D4).
      </p>
    </div>
  )
}
