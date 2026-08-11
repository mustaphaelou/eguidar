import Link from "next/link"
import type { Metadata } from "next"

import { DeleteCategoryButton } from "@/components/admin/delete-category-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listAdminCategoriesWithCounts } from "@/lib/use-cases/admin-structure"
import { deleteCategoryAction } from "@/app/admin/categories/actions"

export const metadata: Metadata = {
  title: "Catégories",
}

type AdminCategory = Awaited<ReturnType<typeof listAdminCategoriesWithCounts>>[number]

function buildRows(
  categories: AdminCategory[],
  parentId: string | null,
  depthByParent: Map<string, number>
): (AdminCategory & { depth: number })[] {
  const children = categories
    .filter((category) => (category.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
  return children.flatMap((category) => {
    const depth = (parentId ? (depthByParent.get(parentId) ?? 0) : -1) + 1
    const row = { ...category, depth }
    return [row, ...buildRows(categories, category.id, depthByParent.set(category.id, depth))]
  })
}

export default async function AdminCategoriesPage() {
  const categories = await listAdminCategoriesWithCounts()
  const rows = buildRows(categories, null, new Map())

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catégories</h1>
        <Button render={<Link href="/admin/categories/nouveau" />}>Nouvelle catégorie</Button>
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
                  <div className="flex items-center gap-3" style={{ paddingLeft: row.depth * 1.5 }}>
                    {row.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image}
                        alt=""
                        className="size-10 shrink-0 rounded-lg border object-cover"
                      />
                    ) : null}
                    <div className="flex flex-col">
                      <span className="font-medium">{row.name}</span>
                      {row.parentId ? (
                        <span className="text-sm text-muted-foreground">
                          sous {row.parent?.name ?? "catégorie inconnue"}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Catégorie racine</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-muted-foreground">{row.slug}</span>
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
                    <span className="text-sm text-muted-foreground">{row._count.children}</span>
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
                      productCount={row._count.products}
                      categories={categories.map((candidate) => ({
                        id: candidate.id,
                        name: candidate.name,
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
