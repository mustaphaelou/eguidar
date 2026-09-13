import Link from "next/link"

import { DeliveryTruck02Icon, Money01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { brand, site, staticPages } from "@/lib/site"

const shopLinks = [{ href: "/", label: "Accueil" }, ...staticPages]

const accountLinks = [
  { href: "/commandes", label: "Mes commandes" },
  { href: "/panier", label: "Mon panier" },
  { href: "/profil", label: "Mon profil" },
]

function LinkColumn({
  title,
  links,
}: {
  title: string
  links: readonly { href: string; label: string }[]
}) {
  return (
    <div>
      <p className="text-xs font-semibold">{title}</p>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-full px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function StorefrontFooter() {
  return (
    <footer className="border-t border-border bg-muted">
      <div className="mx-auto max-w-[980px] px-4 py-10 sm:px-[22px]">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <img
              src={brand.lockup.src}
              width={brand.lockup.width}
              height={brand.lockup.height}
              alt={brand.lockup.alt}
              className="h-[36px] w-auto"
            />
            <p className="mt-2 text-xs text-muted-foreground">{site.tagline}</p>
          </div>
          <LinkColumn title="La boutique" links={shopLinks} />
          <LinkColumn title="Informations" links={accountLinks} />
        </div>

        <section className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
          <div className="flex flex-col gap-2.5">
            <p className="flex items-start gap-2.5">
              <HugeiconsIcon
                icon={Money01Icon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                Paiement à la livraison. TVA 20% incluse sur tous les prix
                affichés.{" "}
                <Link href="/conditions" className="text-link hover:underline">
                  En savoir plus
                </Link>
              </span>
            </p>
            <p className="flex items-start gap-2.5">
              <HugeiconsIcon
                icon={DeliveryTruck02Icon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                Livraison rapide partout au Maroc. Frais selon la ville, offerte
                dès un certain montant.{" "}
                <Link href="/conditions" className="text-link hover:underline">
                  Voir les tarifs
                </Link>
              </span>
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-2">
            <span>© {site.name} — Tous droits réservés.</span>
            {staticPages.map((link, index) => (
              <span key={link.href} className="flex items-center gap-x-2">
                {index > 0 ? (
                  <span aria-hidden="true" className="h-2.5 w-px bg-border" />
                ) : null}
                <Link href={link.href} className="hover:text-foreground">
                  {link.label}
                </Link>
              </span>
            ))}
          </div>
        </section>
      </div>
    </footer>
  )
}
