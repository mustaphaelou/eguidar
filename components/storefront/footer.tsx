import Link from "next/link"

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

interface PiedDePage {
  readonly sections: readonly SectionDuPiedDePage[]
  readonly mentions: {
    readonly copyright: string
    readonly liens: readonly LienDuPiedDePage[]
  }
}

const RECETTE_PETIT_TEXTE = "text-[12px] leading-[1.3334] tracking-[-0.01em]"

const LIEN_DE_PIED =
  "text-encre-annuaire hover:text-foreground hover:underline active:opacity-70 motion-safe:transition-[color,opacity]"

const LIEN_DE_BANDE =
  "text-link underline decoration-1 underline-offset-2 hover:text-foreground active:opacity-70 motion-safe:transition-[color,opacity]"

const CIBLE_LEGALE = "inline-flex min-h-7 min-w-6 items-center"

const GRILLE_DU_PIED: Readonly<Partial<Record<number, string>>> = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
}

const GRILLE_PAR_DEFAUT = "md:grid-cols-4"

function contenuDuPiedDePage(structures: readonly NavCategory[]): PiedDePage {
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

  return {
    sections: [catalogue, compte, aide, maison].filter(
      (section) => section.liens.length > 0
    ),
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

function SectionDuPiedDePage({ section }: { section: SectionDuPiedDePage }) {
  return (
    <details
      open
      data-slot="section-pied-de-page"
      data-section={section.id}
      className="group border-b border-hairline pb-2 last:border-b-0 md:border-b-0 md:pb-0"
    >
      <summary
        className={cn(
          "group/sommaire flex cursor-pointer list-none items-center justify-between gap-4 py-2.5 font-semibold text-foreground md:justify-start md:gap-1.5 md:py-1 [&::-webkit-details-marker]:hidden",
          RECETTE_PETIT_TEXTE
        )}
      >
        <h3 className="font-semibold text-foreground">{section.titre}</h3>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-4 shrink-0 text-muted-foreground group-open:rotate-180 motion-safe:transition-[rotate,opacity] md:group-focus-within/sommaire:opacity-100 md:group-hover/sommaire:opacity-100 md:[@media(hover:hover)]:opacity-0"
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
      <ul className={cn("mt-2 flex flex-col md:mt-0.5", RECETTE_PETIT_TEXTE)}>
        {section.liens.map((lien) => (
          <li key={lien.href}>
            <Link
              href={lien.href}
              className={cn(
                "flex min-h-7 items-center md:min-h-6",
                LIEN_DE_PIED
              )}
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
  const piedDePage = contenuDuPiedDePage(structures)
  const [licence, ...documents] = piedDePage.mentions.liens

  return (
    <footer aria-labelledby="pied-de-page-titre" className="bg-muted">
      <h2 id="pied-de-page-titre" className="sr-only">
        Pied de page
      </h2>
      <div className={CONTENEUR_BOUTIQUE}>
        <div className="border-t border-hairline pt-4 pb-4">
          <nav
            aria-label="Liens du pied de page"
            className={cn(
              "grid grid-cols-1",
              GRILLE_DU_PIED[piedDePage.sections.length] ?? GRILLE_PAR_DEFAUT
            )}
          >
            {piedDePage.sections.map((section) => (
              <SectionDuPiedDePage key={section.id} section={section} />
            ))}
          </nav>

          <p
            data-slot="bande-assurance"
            className={cn("mt-7 text-muted-foreground", RECETTE_PETIT_TEXTE)}
          >
            {site.tagline} {assurancePiedDePage.paiement}{" "}
            {assurancePiedDePage.livraison} {assurancePiedDePage.telephone}{" "}
            <a
              href={`tel:+${site.contactPhoneDigits}`}
              className={LIEN_DE_BANDE}
            >
              {site.contactPhone}
            </a>
            .
          </p>

          <div
            data-slot="rangée-légale"
            className={cn(
              "mt-5 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-hairline pt-3 text-muted-foreground",
              RECETTE_PETIT_TEXTE
            )}
          >
            <p>
              {piedDePage.mentions.copyright}{" "}
              <a
                href={licence!.href}
                target="_blank"
                rel="noreferrer"
                className={cn(CIBLE_LEGALE, LIEN_DE_PIED)}
              >
                {licence!.label}
              </a>
              .
            </p>
            <ul className="flex flex-wrap items-center gap-x-2">
              {documents.map((lien, index) => (
                <li key={lien.href} className="flex items-center gap-x-2">
                  {index > 0 ? (
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-px bg-hairline"
                    />
                  ) : null}
                  <Link
                    href={lien.href}
                    className={cn(CIBLE_LEGALE, LIEN_DE_PIED)}
                  >
                    {lien.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
