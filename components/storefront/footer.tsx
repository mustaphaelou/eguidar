import Link from "next/link"

import { DeliveryTruck02Icon, Money01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Logo } from "@/components/storefront/logo"
import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { site } from "@/lib/site"
import type { NavCategory } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"

type LienDePied = { href: string; libelle: string }
type SectionDePied = {
  id: string
  titre: string
  liens: readonly LienDePied[]
}
type ColonneDePied = { id: string; sections: readonly SectionDePied[] }

function colonnesDuPied(
  structures: readonly NavCategory[]
): readonly ColonneDePied[] {
  return [
    ...(structures.length > 0
      ? [
          {
            id: "boutique",
            sections: [
              {
                id: "la-boutique",
                titre: "La boutique",
                liens: [
                  { href: "/produits", libelle: "Tous les produits" },
                  ...structures.map((structure) => ({
                    href: `/categorie/${structure.slug}`,
                    libelle: structure.name,
                  })),
                ],
              },
            ],
          },
        ]
      : []),
    {
      id: "compte",
      sections: [
        {
          id: "mon-compte",
          titre: "Mon compte",
          liens: [
            { href: "/commandes", libelle: "Mes commandes" },
            { href: "/panier", libelle: "Mon panier" },
            { href: "/profil", libelle: "Mon profil" },
          ],
        },
      ],
    },
    {
      id: "services",
      sections: [
        {
          id: "aide",
          titre: "Aide",
          liens: [
            { href: "/faq", libelle: "FAQ" },
            { href: "/contact", libelle: "Contact" },
          ],
        },
        {
          id: "la-maison",
          titre: "La maison",
          liens: [
            { href: "/a-propos", libelle: "À propos" },
            { href: "/blog", libelle: "Blog" },
          ],
        },
      ],
    },
  ]
}

const liensLegaux: readonly LienDePied[] = [
  { href: "/conditions", libelle: "Conditions & livraison" },
  { href: "/suppression-donnees", libelle: "Suppression des données" },
]

function SectionDuPied({ section }: { section: SectionDePied }) {
  return (
    <details open data-slot="section-pied-de-page" data-section={section.id}>
      <summary className="cursor-pointer py-1 text-xs font-semibold">
        <h3 className="inline">{section.titre}</h3>
      </summary>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {section.liens.map((lien) => (
          <li key={lien.href}>
            <Link
              href={lien.href}
              className="block rounded-full px-2 py-1 text-muted-foreground hover:text-foreground motion-safe:transition-colors"
            >
              {lien.libelle}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function StorefrontFooter({
  structures,
}: {
  structures: readonly NavCategory[]
}) {
  return (
    <footer
      aria-labelledby="pied-de-page-titre"
      className="border-t border-border bg-muted"
    >
      <h2 id="pied-de-page-titre" className="sr-only">
        Pied de page
      </h2>
      <div className={cn(CONTENEUR_BOUTIQUE, "py-10")}>
        <div className="flex flex-col gap-8 md:flex-row md:gap-16">
          <div className="shrink-0">
            <Logo />
            <p className="mt-2 max-w-xs text-xs text-muted-foreground">
              {site.tagline}
            </p>
          </div>
          <nav
            aria-label="Liens du pied de page"
            className="grid flex-1 gap-8 sm:grid-cols-2 md:grid-cols-3"
          >
            {colonnesDuPied(structures).map((colonne) => (
              <div key={colonne.id} className="flex flex-col gap-6">
                {colonne.sections.map((section) => (
                  <SectionDuPied key={section.id} section={section} />
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
          <div className="flex flex-col gap-2.5">
            <p className="flex items-start gap-2.5">
              <HugeiconsIcon
                icon={Money01Icon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                Paiement à la livraison. TVA 20% incluse sur tous les prix
                affichés.
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
                dès un certain montant.
              </span>
            </p>
          </div>
        </div>

        <div
          data-slot="rangée-légale"
          className="mt-6 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"
        >
          <span>
            © {site.name} — Le code est sous{" "}
            <a
              href={site.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-6 min-w-6 items-center justify-center text-link underline"
            >
              licence MIT
            </a>
            .
          </span>
          {liensLegaux.map((lien, index) => (
            <span key={lien.href} className="flex items-center gap-x-2">
              {index > 0 ? (
                <span aria-hidden="true" className="h-2.5 w-px bg-border" />
              ) : null}
              <Link
                href={lien.href}
                className="inline-flex min-h-6 min-w-6 items-center justify-center hover:text-foreground"
              >
                {lien.libelle}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </footer>
  )
}
