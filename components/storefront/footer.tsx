import Link from "next/link"

import { DeliveryTruck02Icon, Money01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { site, staticPages } from "@/lib/site"

const shopLinks = [{ href: "/", label: "Accueil" }, ...staticPages]

const infoLinks = [
  { href: "/commandes", label: "Mes commandes" },
  { href: "/panier", label: "Mon panier" },
  { href: "/profil", label: "Mon profil" },
]

export function StorefrontFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <p className="text-lg font-bold">
              eguidar<span className="text-primary">.ma</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{site.tagline}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">La boutique</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Informations</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {infoLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={Money01Icon} strokeWidth={2} className="mt-0.5 text-muted-foreground" />
              <div>
                <p className="font-medium">Paiement à la livraison</p>
                <p className="text-muted-foreground">TVA 20% incluse sur tous les prix affichés.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={DeliveryTruck02Icon} strokeWidth={2} className="mt-0.5 text-muted-foreground" />
              <div>
                <p className="font-medium">Livraison rapide</p>
                <p className="text-muted-foreground">Frais selon la ville, offerte dès un certain montant.</p>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          © eguidar.ma — Tous droits réservés.
        </p>
      </div>
    </footer>
  )
}
