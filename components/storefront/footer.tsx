import { DeliveryTruck02Icon, Money01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function StorefrontFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <p className="text-lg font-bold">
              eguidar<span className="text-primary">.ma</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              L&apos;électronique au meilleur prix, livrée partout au Maroc.
            </p>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <HugeiconsIcon icon={Money01Icon} strokeWidth={2} className="mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium">Paiement à la livraison</p>
              <p className="text-muted-foreground">TVA 20% incluse sur tous les prix affichés.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <HugeiconsIcon icon={DeliveryTruck02Icon} strokeWidth={2} className="mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium">Livraison rapide</p>
              <p className="text-muted-foreground">Frais selon la ville, offerte dès un certain montant.</p>
            </div>
          </div>
        </div>
        <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          © eguidar.ma — Tous droits réservés.
        </p>
      </div>
    </footer>
  )
}
