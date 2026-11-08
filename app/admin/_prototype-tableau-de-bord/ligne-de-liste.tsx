import Link from "next/link"

/**
 * PROTOTYPE (#964) — le rythme commun des deux listes. Une ligne, deux lignes
 * de texte à gauche, le ou les objets de valeur à droite, et un lien qui prend
 * la ligne entière : c'est ce qui manque aujourd'hui à la liste du stock, dont
 * seul le nom du Produit est cliquable.
 */
export function LigneDeListe({
  href,
  titre,
  sousTitre,
  trailing,
}: {
  href: string
  titre: React.ReactNode
  sousTitre: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-16 items-center justify-between gap-4 px-(--card-spacing) py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{titre}</span>
          <span className="truncate text-xs text-muted-foreground">
            {sousTitre}
          </span>
        </span>
        {trailing ? (
          <span className="flex shrink-0 items-center gap-2">{trailing}</span>
        ) : null}
      </Link>
    </li>
  )
}
