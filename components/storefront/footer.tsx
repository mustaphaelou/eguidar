import Link from "next/link"

import {
  CallIcon,
  DeliveryTruck02Icon,
  Money01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { assurancePiedDePage, site } from "@/lib/site"
import { cn } from "@/lib/utils"

type LienDePied = { href: string; libelle: string }
type SectionDePied = {
  id: string
  titre: string
  liens: readonly LienDePied[]
}
type ColonneDePied = { id: string; sections: readonly SectionDePied[] }

const colonnesDuPied: readonly ColonneDePied[] = [
  {
    id: "boutique",
    sections: [
      {
        id: "la-boutique",
        titre: "La boutique",
        liens: [
          { href: "/", libelle: "Accueil" },
          { href: "/produits", libelle: "Tous les produits" },
        ],
      },
    ],
  },
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

export function StorefrontFooter() {
  return (
    <footer
      aria-labelledby="pied-de-page-titre"
      className="border-t border-border bg-muted"
    >
      <h2 id="pied-de-page-titre" className="sr-only">
        Pied de page
      </h2>
      <div className={cn(CONTENEUR_BOUTIQUE, "py-10")}>
        <nav
          aria-label="Liens du pied de page"
          className="grid gap-8 sm:grid-cols-2 md:grid-cols-3"
        >
          {colonnesDuPied.map((colonne) => (
            <div key={colonne.id} className="flex flex-col gap-6">
              {colonne.sections.map((section) => (
                <SectionDuPied key={section.id} section={section} />
              ))}
            </div>
          ))}
        </nav>

        <section
          data-slot="bande-assurance"
          className="mt-8 text-xs text-muted-foreground"
        >
          <p>{site.tagline}</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <p className="flex items-start gap-2.5">
              <HugeiconsIcon
                icon={Money01Icon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{assurancePiedDePage.paiement}</span>
            </p>
            <p className="flex items-start gap-2.5">
              <HugeiconsIcon
                icon={DeliveryTruck02Icon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{assurancePiedDePage.livraison}</span>
            </p>
            <p className="flex items-start gap-2.5">
              <HugeiconsIcon
                icon={CallIcon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                {assurancePiedDePage.telephone}{" "}
                <a
                  href={`tel:+${site.contactPhoneDigits}`}
                  className="text-link underline"
                >
                  {site.contactPhone}
                </a>
              </span>
            </p>
          </div>
        </section>

        <div
          data-slot="rangée-légale"
          className="mt-8 flex flex-wrap items-center gap-x-2 border-t border-border pt-6 text-xs text-muted-foreground"
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
