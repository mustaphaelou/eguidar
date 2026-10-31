import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/admin/page-header"
import { ShippingSettingsForm } from "@/components/admin/shipping-settings-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatPrice } from "@/lib/money"
import { getShippingSettings } from "@/lib/use-cases/livraison"
import { updateShippingSettingsAction } from "@/app/admin/livraison/actions"

export const metadata: Metadata = {
  title: "Livraison",
}

export default async function AdminShippingSettingsPage() {
  const settings = await getShippingSettings()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Livraison"
        description="Le seuil à partir duquel une commande bénéficie de la livraison offerte."
      />

      <Card className="w-full max-w-2xl">
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
