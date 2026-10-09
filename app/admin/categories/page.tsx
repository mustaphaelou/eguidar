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
import { lireEcranAdmin } from "@/lib/use-cases/lecture-structure"
import { deleteCategoryAction } from "@/app/admin/categories/actions"

export const metadata: Metadata = {
  title: "Catégories",
}

const RETRAIT_PAR_NIVEAU = 1.5

export default async function AdminCategoriesPage() {
  const { lignes, cibles } = await lireEcranAdmin()
  const nomsStructures: Record<string, string> = Object.fromEntries(
    lignes.map((ligne) => [ligne.id, ligne.name])
  )
  const ciblesParStructure = new Map(cibles.map((cible) => [cible.id, cible]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Catégories</h1>
        <Button render={<Link href="/admin/categories/nouveau" />}>
          Nouvelle catégorie
        </Button>
      </div>

      {lignes.length === 0 ? (
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
            {lignes.map((ligne) => {
              const cible = ciblesParStructure.get(ligne.id)!
              return (
                <TableRow key={ligne.id}>
                  <TableCell>
                    <div
                      className="flex items-center gap-3"
                      style={{
                        paddingLeft: ligne.profondeur * RETRAIT_PAR_NIVEAU,
                      }}
                    >
                      {ligne.image ? (
                        <Image
                          src={ligne.image}
                          alt=""
                          width={40}
                          height={40}
                          className="size-10 shrink-0 rounded-lg border object-cover"
                        />
                      ) : null}
                      <div className="flex flex-col">
                        <span className="font-medium">{ligne.name}</span>
                        {ligne.horsArbre ? (
                          <Badge variant="destructive">hors arbre</Badge>
                        ) : ligne.parentId ? (
                          <span className="text-sm text-muted-foreground">
                            sous {ligne.nomParente ?? "catégorie inconnue"}
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
                      {ligne.slug}
                    </span>
                  </TableCell>
                  <TableCell>
                    {ligne.nombreProduits > 0 ? (
                      <Badge>{ligne.nombreProduits}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {ligne.nombreEnfants > 0 ? (
                      <span className="text-sm text-muted-foreground">
                        {ligne.nombreEnfants}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        render={<Link href={`/admin/categories/${ligne.id}`} />}
                        variant="outline"
                        size="sm"
                      >
                        Modifier
                      </Button>
                      <DeleteCategoryButton
                        categoryId={ligne.id}
                        categoryName={ligne.name}
                        childCount={ligne.nombreEnfants}
                        productCount={ligne.nombreProduits}
                        ciblesProduits={cible.produits}
                        ciblesSousCategories={cible.sousCategories}
                        nomsStructures={nomsStructures}
                        action={deleteCategoryAction}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
