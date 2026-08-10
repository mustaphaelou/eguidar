import { notFound } from "next/navigation"

import { ProductForm, type ProductFormInitial } from "@/components/admin/product-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAdminProduct, listAdminCategories } from "@/lib/use-cases/admin-catalog"
import { updateProductAction, updateVariantStockAction } from "@/app/admin/produits/actions"

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [product, categories] = await Promise.all([getAdminProduct(id), listAdminCategories()])
  if (!product) notFound()

  const initial: ProductFormInitial = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    categoryId: product.categoryId,
    description: product.description,
    price: product.price,
    isFeatured: product.isFeatured,
    featuredOrder: product.featuredOrder,
    freeShipping: product.freeShipping,
    specs: product.specs as Record<string, string>,
    images: product.images as string[],
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      priceDelta: variant.priceDelta,
      stock: variant.stock,
    })),
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Modifier — {product.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Stock des variantes</CardTitle>
          <CardDescription>Mise à jour rapide du stock, sans re-sauvegarder le produit.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variante</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="w-40">Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.variants.map((variant) => (
                <TableRow key={variant.id}>
                  <TableCell className="font-medium">{variant.name}</TableCell>
                  <TableCell className="text-muted-foreground">{variant.sku}</TableCell>
                  <TableCell>
                    <form action={updateVariantStockAction} className="flex items-center gap-2">
                      <input type="hidden" name="variantId" value={variant.id} />
                      <Input
                        name="stock"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={variant.stock}
                        className="h-8 w-24"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Enregistrer
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ProductForm product={initial} categories={categories} action={updateProductAction} />
    </div>
  )
}
