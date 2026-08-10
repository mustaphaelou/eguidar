import Link from "next/link"

import { DeleteCityButton } from "@/components/admin/delete-city-button"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatPrice } from "@/lib/money"
import { listAdminCities } from "@/lib/use-cases/admin-structure"
import { deleteCityAction } from "@/app/admin/villes/actions"

export default async function AdminCitiesPage() {
  const cities = await listAdminCities()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Villes de livraison</h1>
        <Button render={<Link href="/admin/villes/nouveau" />}>Nouvelle ville</Button>
      </div>

      {cities.length === 0 ? (
        <p className="text-muted-foreground">
          Aucune ville pour le moment. Ajoutez les villes couvertes par la livraison COD.
        </p>
      ) : (
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
                <TableCell>{formatPrice(city.fee)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button render={<Link href={`/admin/villes/${city.id}`} />} variant="outline" size="sm">
                      Modifier
                    </Button>
                    <DeleteCityButton cityId={city.id} cityName={city.name} action={deleteCityAction} />
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
