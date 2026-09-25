import Image from "next/image"
import Link from "next/link"
import type { Metadata } from "next"

import { DeleteProductButton } from "@/components/admin/delete-product-button"
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
import { formatPrice } from "@/lib/money"
import { listAdminProducts } from "@/lib/use-cases/admin-catalog"
import { deleteProductAction } from "@/app/admin/produits/actions"

export const metadata: Metadata = {
  title: "Produits",
}

export default async function AdminProductsPage() {
  const products = await listAdminProducts()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Produits</h1>
        <Button render={<Link href="/admin/produits/nouveau" />}>
          Nouveau produit
        </Button>
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground">
          Aucun produit pour le moment. Créez votre premier produit.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produit</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt=""
                        width={40}
                        height={40}
                        className="size-10 rounded-lg border object-cover"
                      />
                    ) : null}
                    <div className="flex flex-col">
                      <span className="font-medium">{product.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {product.brand}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{product.categoryName}</TableCell>
                <TableCell>{formatPrice(product.price)}</TableCell>
                <TableCell>
                  <span
                    className={
                      product.totalStock === 0 ? "text-destructive" : undefined
                    }
                  >
                    {product.totalStock}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {product.isFeatured ? <Badge>Mis en avant</Badge> : null}
                    {product.freeShipping ? (
                      <Badge variant="secondary">Livraison offerte</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      render={<Link href={`/admin/produits/${product.id}`} />}
                      variant="outline"
                      size="sm"
                    >
                      Modifier
                    </Button>
                    <DeleteProductButton
                      productId={product.id}
                      productName={product.name}
                      action={deleteProductAction}
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
