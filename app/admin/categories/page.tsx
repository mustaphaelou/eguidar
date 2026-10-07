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
import { lireLignesAdmin } from "@/lib/use-cases/lecture-structure"
import { deleteCategoryAction } from "@/app/admin/categories/actions"

export const metadata: Metadata = {
  title: "Catégories",
}

/**
 * Le retrait qu'un niveau de profondeur vaut à l'écran. C'est **une décision de
 * mise en page, et rien d'autre** : la profondeur elle-même est un fait que le
 * module promet, et sa preuve est dans la suite du module, où elle ne se lit pas
 * dans un `padding`. Le jour où l'écran change d'échelle, cette constante change
 * — et aucune épreuve de domaine ne bouge avec elle.
 */
const RETRAIT_PAR_NIVEAU = 1.5

export default async function AdminCategoriesPage() {
  // **Une lecture, une marche, une ligne par cycle** — la promesse n'est plus
  // écrite ici mais tenue par le module : l'écran rend les lignes qu'il lui rend,
  // et ne construit plus ni arbre, ni profondeur, ni tri, ni partition. Ce qu'il
  // garde, c'est le rendu — le retrait que vaut une profondeur, la marque hors
  // arbre, et la table des noms que la boîte lit pour nommer ses cibles
  // (#564, ADR-0030).
  //
  // **Une seule porte, donc une seule lecture, une seule marche** : les deux
  // listes de cibles que reçoit la boîte sont sur la même ligne que les compteurs
  // et la profondeur. Les demander à part aurait relu la table et — bien pire —
  // aurait rebâti une marche par ligne, donc autant de retenues, donc **autant de
  // lignes de journal pour un seul cycle** : un avertissement qui aurait annoncé
  // à un éditeur autant de corruptions à réparer qu'il y a de lignes sur l'écran
  // (ADR-0030).
  const lignes = await lireLignesAdmin()
  // La table des noms, bâtie **une fois** pour toutes les boîtes de la page. C'est
  // un objet de chaînes, donc il franchit la couture (ADR-0028) — un `Map` ou une
  // fonction ne la franchirait pas. Le repli sur l'identifiant est dans la boîte :
  // une cible sans nom reste affichable, et elle reste vraie.
  const nomsStructures: Record<string, string> = Object.fromEntries(
    lignes.map((ligne) => [ligne.id, ligne.name])
  )

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
            {lignes.map((ligne) => (
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
                        /* La marque du glossaire, et la seule : une Structure
                           hors arbre a une parente en base, mais aucune racine
                           ne mène à elle — « sous … » mentirait sur sa place,
                           et « Catégorie racine » sur sa nature. Le rouge
                           discret du `Badge` la lit comme ce qu'elle est, une
                           corruption à réparer, et non comme un compte. */
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
                      ciblesProduits={ligne.ciblesProduits}
                      ciblesSousCategories={ligne.ciblesSousCategories}
                      nomsStructures={nomsStructures}
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
