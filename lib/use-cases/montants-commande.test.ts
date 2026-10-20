import { describe, expect, it } from "vitest"

import type { ValidatedSelectionDevis } from "@/lib/use-cases/devis"
import { montantsDeLaCommande } from "@/lib/use-cases/montants-commande"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison-prix"

const city = (
  id: string,
  name: string,
  fee: number,
  slug = `slug-${id}`
): DeliveryCityOption => ({
  id,
  slug,
  name,
  fee,
})

const quote = (subtotal: number, shippingFee: number): ShippingQuote => ({
  subtotal,
  shippingFee,
  total: subtotal + shippingFee,
})

describe("montantsDeLaCommande", () => {
  it("copies the Devis' Total à payer, never the sum of the Sous-total and the Frais de livraison", () => {
    const devisTruqué: ShippingQuote = {
      ...quote(500, 222),
      total: 999,
    }
    const sélection: ValidatedSelectionDevis = {
      cas: "validée",
      ville: city("c1", "Casablanca", 222),
      devis: devisTruqué,
    }

    expect(montantsDeLaCommande(500, sélection)).toStrictEqual({
      total: 500,
      shippingFee: 222,
      totalPayable: 999,
    })
  })

  it("lit le Total dans le Sous-total reçu, jamais dans celui que le Devis porte", () => {
    const devisDiscordant = quote(400, 222)
    const sélection: ValidatedSelectionDevis = {
      cas: "validée",
      ville: city("c1", "Casablanca", 222),
      devis: devisDiscordant,
    }

    const montants = montantsDeLaCommande(500, sélection)

    expect(montants.total).toBe(500)
    expect(montants.total).not.toBe(devisDiscordant.subtotal)
    expect(montants.total).not.toBe(
      devisDiscordant.subtotal + devisDiscordant.shippingFee
    )
  })
})
