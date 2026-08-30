import type { Metadata } from "next"
import Link from "next/link"

import {
  buildFaqPageDonneesStructurees,
  serializeJsonLd,
} from "@/lib/donnees-structurees"
import { faqs } from "@/lib/faq"
import { pageMetadata } from "@/lib/metadata"

export const metadata: Metadata = pageMetadata({
  title: "FAQ",
  description:
    "Questions fréquentes sur eguidar.com : commande, paiement à la livraison, frais de livraison, suivi de commande, retours et remboursements.",
  path: "/faq",
})

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildFaqPageDonneesStructurees(faqs)),
        }}
      />
      <h1 className="text-3xl font-bold">Questions fréquentes</h1>
      <p className="mt-3 text-muted-foreground">
        Tout ce qu&apos;il faut savoir sur vos commandes, la livraison et les
        retours.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            className="group rounded-2xl border px-5 py-4 transition-colors open:border-ring"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
              {faq.question}
              <span className="text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>

      <p className="mt-8 rounded-2xl bg-muted/40 p-6 text-sm leading-relaxed text-muted-foreground">
        Vous n&apos;avez pas trouvé votre réponse ?{" "}
        <Link
          href="/contact"
          className="font-medium text-primary hover:underline"
        >
          Contactez-nous
        </Link>{" "}
        — nous répondons sous 24h ouvrées.
      </p>
    </div>
  )
}
