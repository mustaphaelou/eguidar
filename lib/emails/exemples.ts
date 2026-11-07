import type { OrderEmailSnapshot } from "@/lib/automations/charge"

export const commandeStandard: OrderEmailSnapshot = {
  userEmail: "client@example.com",
  orderId: "ord_1234567890",
  items: [
    {
      productName: "Théière",
      variantName: "Argentée",
      quantity: 2,
      price: 12500,
    },
  ],
  total: 25000,
  shippingFee: 3000,
  totalPayable: 28000,
  cityName: "Casablanca",
  address: "123 Bd d'Anfa",
  phone: "0600000000",
}

export const commandeLivraisonOfferte: OrderEmailSnapshot = {
  ...commandeStandard,
  shippingFee: 0,
  totalPayable: 25000,
}

export const commandeAnnulee: OrderEmailSnapshot = {
  ...commandeStandard,
  orderId: "ord_annulee01",
}

export const commandeCaracteresSpeciaux: OrderEmailSnapshot = {
  ...commandeStandard,
  items: [
    {
      productName: "Théière <&\"'",
      variantName: "Édition & dorée",
      quantity: 1,
      price: 25000,
    },
  ],
}
