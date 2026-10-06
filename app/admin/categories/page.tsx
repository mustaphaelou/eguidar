import Image from "next/image"
import Link from "next/link"
import type { Metadata } from "next"

import { DeleteCategoryButton } from "@/components/admin/delete-category-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { marcheDesStructures } from "@/lib/marche-structure"
import { listAdminCategoriesWithCounts } from "@/lib/use-cases/admin-structure"
import { deleteCategoryAction } from "@/app/admin/categories/actions"

export const metadata: Metadata = {
  title: "Catégories",
}

type AdminCategory = Awaited<
  ReturnType<typeof listAdminCategoriesWithCounts>
>[number]

/**
 * Une ligne de la liste. `depth` est le retrait de l'arbre, et `horsArbre` la
 * seule chose que la ligne doit à sa provenance : une Structure qu'aucune
 * racine n'atteint ne se range dans aucune branche, donc elle ne se lit pas
 * comme les autres (ADR-0030, #550).
 */
type LigneCategorie = AdminCategory & { depth: number; horsArbre: boolean }

/**
 * Les lignes des Structures hors arbre. Elles se lisent **après** l'arbre et à
 * la racine : aucune branche ne les porte, donc rien ne les indente. La
 * collation est celle de l'arbre, et le tri est explicite parce que la marche
 * ne promet aucun ordre — elle promet des faits, pas une mise en page
 * (ADR-0030, #550).
 */
function buildHorsArbreRows(
  categories: AdminCategory[],
  horsArbre: ReadonlySet<string>
): LigneCategorie[] {
  return categories
    .filter((category) => horsArbre.has(category.id))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((category) => ({ ...category, depth: 0, horsArbre: true }))
}

function buildRows(
  categories: AdminCategory[],
  parentId: string | null,
  depthByParent: Map<string, number>
): LigneCategorie[] {
  const children = categories
    .filter((category) => (category.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
  return children.flatMap((category) => {
    const depth = (parentId ? (depthByParent.get(parentId) ?? 0) : -1) + 1
    const row = { ...category, depth, horsArbre: false }
    return [
      row,
      ...buildRows(
        categories,
        category.id,
        depthByParent.set(category.id, depth)
      ),
    ]
  })
}

export default async function AdminCategoriesPage() {
  const categories = await listAdminCategoriesWithCounts()
  // **Une seule marche pour la page.** C'est elle qui nomme les Structures
  // qu'aucune racine n'atteint — un cycle, une chaîne qui y mène, et tout ce
  // qu'un cycle soustrait à l'arbre. Construite une fois, elle n'écrit donc
  // qu'une ligne par cycle : deux marches pour la même page en écriraient
  // deux, chacune ayant sa propre retenue (ADR-0030, #550). Les noms de la
  // lecture entrent dans la marche parce que le journal les nomme : sans eux
  // il n'égrènerait que des `cuid`.
  const marche = marcheDesStructures(categories)
  const rows = [
    ...buildRows(categories, null, new Map()),
    ...buildHorsArbreRows(categories, new Set(marche.horsArbre())),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catégories</h1>
        <Button render={<Link href="/admin/categories/nouveau" />}>
          Nouvelle catégorie
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          Aucune catégorie pour le moment. Créez votre première catégorie.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Catégorie</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Produits</TableHead>
              <TableHead>Sous-catégories</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div
                    className="flex items-center gap-3"
                    style={{ paddingLeft: row.depth * 1.5 }}
                  >
                    {row.image ? (
                      <Image
                        src={row.image}
                        alt=""
                        width={40}
                        height={40}
                        className="size-10 shrink-0 rounded-lg border object-cover"
                      />
                    ) : null}
                    <div className="flex flex-col">
                      <span className="font-medium">{row.name}</span>
                      {row.horsArbre ? (
                        /* La marque du glossaire, et la seule : une Structure
                           hors arbre a une parente en base, mais aucune racine
                           ne mène à elle — « sous … » mentirait sur sa place,
                           et « Catégorie racine » sur sa nature. Le rouge
                           discret du `Badge` la lit comme ce qu'elle est, une
                           corruption à réparer, et non comme un compte. */
                        <Badge variant="destructive">hors arbre</Badge>
                      ) : row.parentId ? (
                        <span className="text-sm text-muted-foreground">
                          sous {row.parent?.name ?? "catégorie inconnue"}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Catégorie racine
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-muted-foreground">
                    {row.slug}
                  </span>
                </TableCell>
                <TableCell>
                  {row._count.products > 0 ? (
                    <Badge>{row._count.products}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  {row._count.children > 0 ? (
                    <span className="text-sm text-muted-foreground">
                      {row._count.children}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      render={<Link href={`/admin/categories/${row.id}`} />}
                      variant="outline"
                      size="sm"
                    >
                      Modifier
                    </Button>
                    <DeleteCategoryButton
                      categoryId={row.id}
                      categoryName={row.name}
                      childCount={row._count.children}
                      productCount={row._count.products}
                      categories={categories.map((candidate) => ({
                        id: candidate.id,
                        name: candidate.name,
                        parentId: candidate.parentId,
                      }))}
                      action={deleteCategoryAction}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
