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
  // arbre, la table des noms que la boîte lit pour nommer ses cibles, et le
  // raccord entre une ligne et les deux listes de sa boîte (#564, ADR-0030).
  //
  // **Une seule porte, donc une seule lecture, une seule marche** : les lignes et
  // les cibles que reçoit chaque boîte sortent du même retour, calculées sur la
  // même marche. Les demander à deux portes aurait relu la table et — bien pire —
  // aurait rebâti une marche par ligne, donc autant de retenues, donc **autant de
  // lignes de journal pour un seul cycle** : un avertissement qui aurait annoncé
  // à un éditeur autant de corruptions à réparer qu'il y a de lignes sur l'écran
  // (ADR-0030).
  const { lignes, cibles } = await lireEcranAdmin()
  // La table des noms, bâtie **une fois** pour toutes les boîtes de la page. C'est un
  // objet de chaînes, donc il franchit la couture (ADR-0028) — un `Map` ou une
  // fonction ne la franchirait pas. Le repli sur l'identifiant est dans la boîte :
  // une cible sans nom reste affichable, et elle reste vraie.
  const nomsStructures: Record<string, string> = Object.fromEntries(
    lignes.map((ligne) => [ligne.id, ligne.name])
  )
  // Les cibles, indexées une fois pour toutes les lignes. C'est un **rangement**,
  // pas une règle : le module garantit une cible par Structure, dans l'ordre de
  // sa lecture, donc chaque ligne trouve la sienne par son identifiant sans
  // qu'on ait à la chercher.
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
              // Les deux listes de cette boîte. Une cible par Structure est la
              // promesse du module — la projection en rend autant qu'il y a de
              // Structures lues, chacune une fois, dans l'ordre de la lecture et
              // non dans celui des lignes — donc le `!` porte sur un fait que la
              // porte de lecture vient de rendre, pas sur une recherche.
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
