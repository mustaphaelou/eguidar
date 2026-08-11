import type { Metadata } from "next"

import { ShippingSettingsForm } from "@/components/admin/shipping-settings-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPrice } from "@/lib/money"
import { getShippingSettings } from "@/lib/use-cases/admin-structure"
import { updateShippingSettingsAction } from "@/app/admin/livraison/actions"

export const metadata: Metadata = {
  title: "Livraison",
}

export default async function AdminShippingSettingsPage() {
  const settings = await getShippingSettings()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Livraison</h1>

      <Card>
        <CardHeader>
          <CardTitle>Livraison offerte</CardTitle>
          <CardDescription>
            {settings && settings.freeShippingThreshold > 0 ? (
              <>
                Actuellement : livraison offerte dès{" "}
                <span className="font-medium text-foreground">
                  {formatPrice(settings.freeShippingThreshold)}
                </span>{" "}
                de commande.
              </>
            ) : (
              "La livraison offerte n'est pas encore configurée."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShippingSettingsForm
            threshold={settings?.freeShippingThreshold ?? null}
            action={updateShippingSettingsAction}
          />
        </CardContent>
      </Card>
    </div>
  )
}
