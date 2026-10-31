import Link from "next/link"
import type { Metadata } from "next"

import { DeleteCityButton } from "@/components/admin/delete-city-button"
import { EmptyState } from "@/components/admin/empty-state"
import { PageHeader } from "@/components/layout/admin/page-header"
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
import { listAdminCities } from "@/lib/use-cases/livraison"
import { deleteCityAction } from "@/app/admin/villes/actions"

export const metadata: Metadata = {
  title: "Villes de livraison",
}

export default async function AdminCitiesPage() {
  const cities = await listAdminCities()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Villes de livraison"
        description="Les villes couvertes par la livraison à domicile et leurs frais."
        actions={
          <Button render={<Link href="/admin/villes/nouveau" />}>
            Nouvelle ville
          </Button>
        }
      />

      {cities.length === 0 ? (
        <EmptyState
          title="Aucune ville pour le moment."
          description="Ajoutez les villes couvertes par la livraison COD pour calculer les frais à la commande."
          action={
            <Button render={<Link href="/admin/villes/nouveau" />}>
              Ajouter une ville
            </Button>
          }
        />
      ) : (
        <div className="overflow-clip rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2.5">
            <p className="text-sm font-medium">
              {cities.length} ville{cities.length > 1 ? "s" : ""} desservie
              {cities.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Frais appliqués au panier
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ville</TableHead>
                <TableHead>Frais de livraison</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cities.map((city) => (
                <TableRow key={city.id}>
                  <TableCell className="font-medium">{city.name}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatPrice(city.fee)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        render={<Link href={`/admin/villes/${city.id}`} />}
                        variant="ghost"
                        size="sm"
                      >
                        Modifier
                      </Button>
                      <DeleteCityButton
                        cityId={city.id}
                        cityName={city.name}
                        action={deleteCityAction}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
