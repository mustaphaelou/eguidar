import Link from "next/link"

import {
  CallIcon,
  DeliveryTruck02Icon,
  Money01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { assurancePiedDePage, site } from "@/lib/site"
import type { NavCategory } from "@/lib/use-cases/storefront"
import { cn } from "@/lib/utils"

interface LienDuPiedDePage {
  readonly href: string
  readonly label: string
}

interface SectionDuPiedDePage {
  readonly id: string
  readonly titre: string
  readonly liens: readonly LienDuPiedDePage[]
}

type ColonneDuPiedDePage = readonly SectionDuPiedDePage[]

interface PiedDePage {
  readonly colonnes: readonly ColonneDuPiedDePage[]
  readonly mentions: {
    readonly copyright: string
    readonly liens: readonly LienDuPiedDePage[]
  }
}

const RECETTE_PETIT_TEXTE = "text-[12px] leading-[1.3334] tracking-[-0.01em]"

const RETOURS_DU_LIEN =
  "hover:text-foreground hover:underline active:opacity-70 motion-safe:transition-[color,opacity]"

function piedDePage(structures: readonly NavCategory[]): PiedDePage {
  const catalogue: SectionDuPiedDePage = {
    id: "la-boutique",
    titre: "La boutique",
    liens:
      structures.length > 0
        ? [
            { href: "/produits", label: "Tous les produits" },
            ...structures.map((structure) => ({
              href: `/categorie/${structure.slug}`,
              label: structure.name,
            })),
          ]
        : [],
  }

  const compte: SectionDuPiedDePage = {
    id: "mon-compte",
    titre: "Mon compte",
    liens: [
      { href: "/commandes", label: "Mes commandes" },
      { href: "/panier", label: "Mon panier" },
      { href: "/profil", label: "Mon profil" },
    ],
  }

  const aide: SectionDuPiedDePage = {
    id: "aide",
    titre: "Aide",
    liens: [
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
    ],
  }

  const maison: SectionDuPiedDePage = {
    id: "la-maison",
    titre: "La maison",
    liens: [
      { href: "/a-propos", label: "À propos" },
      { href: "/blog", label: "Blog" },
    ],
  }

  const colonnes = [[catalogue], [compte], [aide, maison]]
    .map((sections) => sections.filter((section) => section.liens.length > 0))
    .filter((sections) => sections.length > 0)

  return {
    colonnes,
    mentions: {
      copyright: `© ${site.name} — Le code est sous`,
      liens: [
        { href: site.licenseUrl, label: "licence MIT" },
        { href: "/conditions", label: "Conditions & livraison" },
        { href: "/suppression-donnees", label: "Suppression des données" },
      ],
    },
  }
}

function SectionDuPied({ section }: { section: SectionDuPiedDePage }) {
  return (
    <details
      open
      data-slot="section-pied-de-page"
      data-section={section.id}
      className="group border-b border-hairline md:border-b-0"
    >
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-4 py-1 font-semibold text-foreground [&::-webkit-details-marker]:hidden ${RECETTE_PETIT_TEXTE}`}
      >
        <h3 className={`font-semibold text-foreground ${RECETTE_PETIT_TEXTE}`}>
          {section.titre}
        </h3>
        <svg
          aria-hidden="true"
          data-slot="chevron-pied-de-page"
          viewBox="0 0 16 16"
          className="size-4 shrink-0 text-muted-foreground group-open:rotate-180 motion-safe:transition-transform"
          fill="none"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <ul className={`mt-2 flex flex-col gap-1 ${RECETTE_PETIT_TEXTE}`}>
        {section.liens.map((lien) => (
          <li key={lien.href}>
            <Link
              href={lien.href}
              className={`flex min-h-7 items-center text-encre-annuaire ${RETOURS_DU_LIEN}`}
            >
              {lien.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function StorefrontFooter({
  structures = [],
}: {
  structures?: readonly NavCategory[]
}) {
  const pied = piedDePage(structures)
  const [licence, ...documents] = pied.mentions.liens

  return (
    <footer
      aria-labelledby="pied-de-page-titre"
      className="border-t border-hairline bg-muted"
    >
      <h2 id="pied-de-page-titre" className="sr-only">
        Pied de page
      </h2>
      <div className={cn(CONTENEUR_BOUTIQUE, "py-10")}>
        <nav
          aria-label="Liens du pied de page"
          className="grid gap-8 sm:grid-cols-2 md:grid-cols-3"
        >
          {pied.colonnes.map((colonne) => (
            <div key={colonne[0]!.id} className="flex flex-col gap-6">
              {colonne.map((section) => (
                <SectionDuPied key={section.id} section={section} />
              ))}
            </div>
          ))}
        </nav>

        <section
          data-slot="bande-assurance"
          className={`mt-8 text-muted-foreground ${RECETTE_PETIT_TEXTE}`}
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
                  className={`inline-flex min-h-7 min-w-6 items-center ${RETOURS_DU_LIEN}`}
                >
                  {site.contactPhone}
                </a>
              </span>
            </p>
          </div>
        </section>

        <div
          data-slot="rangée-légale"
          className={`mt-8 flex flex-wrap items-center gap-x-2 border-t border-hairline pt-6 text-muted-foreground ${RECETTE_PETIT_TEXTE}`}
        >
          <span>
            {pied.mentions.copyright}{" "}
            <a
              href={licence!.href}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex min-h-7 min-w-6 items-center ${RETOURS_DU_LIEN}`}
            >
              {licence!.label}
            </a>
            .
          </span>
          {documents.map((lien, index) => (
            <span key={lien.href} className="flex items-center gap-x-2">
              {index > 0 ? (
                <span aria-hidden="true" className="h-2.5 w-px bg-hairline" />
              ) : null}
              <Link
                href={lien.href}
                className={`inline-flex min-h-7 min-w-6 items-center ${RETOURS_DU_LIEN}`}
              >
                {lien.label}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </footer>
  )
}
