import "dotenv/config"

import { identifiantsCompteAdmin } from "../../prisma/compte-admin"

export const NUMERO_DE_LA_COMMANDE_LIVREE = "e2e-commande-livree-923"
export const NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION =
  "e2e-commande-confirmation-923"

export const NOM_LONG_DE_PRODUIT_DE_FIXTURE =
  "Ordinateur portable professionnel Apple MacBook Pro 16 pouces — puce M3 Max"
export const NOM_COURT_DE_PRODUIT_DE_FIXTURE = "Souris sans fil Bluetooth"

export const TOTAL_DE_LA_COMMANDE_LIVREE = 1_599_800
export const TOTAL_DE_LA_COMMANDE_DE_CONFIRMATION = 3_299_000

export const PRIX_DE_LA_LIGNE_LONGUE_DE_CONFIRMATION = 2_999_000

export const VILLE_DES_COMMANDES_DE_FIXTURE = "Casablanca"
export const ADRESSE_DES_COMMANDES_DE_FIXTURE =
  "12, rue des Commandes de fixture"
export const TELEPHONE_DES_COMMANDES_DE_FIXTURE = "+212 6 00 00 00 00"

export interface ArticleDeCommandeDeFixture {
  productName: string
  variantName: string
  price: number
  quantity: number
}

export interface CommandeDeFixture {
  id: string
  userId: string
  status: "delivered" | "confirmed"
  cityName: string
  address: string
  phone: string
  total: number
  shippingFee: number
  totalPayable: number
  createdAt: Date
  items: ArticleDeCommandeDeFixture[]
}

function commandeLivree(userId: string, maintenant: Date): CommandeDeFixture {
  return {
    id: NUMERO_DE_LA_COMMANDE_LIVREE,
    userId,
    status: "delivered",
    cityName: VILLE_DES_COMMANDES_DE_FIXTURE,
    address: ADRESSE_DES_COMMANDES_DE_FIXTURE,
    phone: TELEPHONE_DES_COMMANDES_DE_FIXTURE,
    total: 1_596_800,
    shippingFee: 3_000,
    totalPayable: TOTAL_DE_LA_COMMANDE_LIVREE,
    createdAt: maintenant,
    items: [
      {
        productName: "Ordinateur portable professionnel",
        variantName: "16 Go / 1 To",
        price: 1_596_800,
        quantity: 1,
      },
    ],
  }
}

function commandeDeConfirmation(
  userId: string,
  maintenant: Date
): CommandeDeFixture {
  return {
    id: NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION,
    userId,
    status: "confirmed",
    cityName: VILLE_DES_COMMANDES_DE_FIXTURE,
    address: ADRESSE_DES_COMMANDES_DE_FIXTURE,
    phone: TELEPHONE_DES_COMMANDES_DE_FIXTURE,
    total: 3_299_000,
    shippingFee: 0,
    totalPayable: TOTAL_DE_LA_COMMANDE_DE_CONFIRMATION,
    createdAt: maintenant,
    items: [
      {
        productName: NOM_LONG_DE_PRODUIT_DE_FIXTURE,
        variantName: "M3 Max — 36 Go / 1 To",
        price: PRIX_DE_LA_LIGNE_LONGUE_DE_CONFIRMATION,
        quantity: 1,
      },
      {
        productName: NOM_COURT_DE_PRODUIT_DE_FIXTURE,
        variantName: "Blanc",
        price: 300_000,
        quantity: 1,
      },
    ],
  }
}

export function construireLesCommandesDeFixture(
  userId: string,
  maintenant: Date = new Date()
): CommandeDeFixture[] {
  return [
    commandeLivree(userId, maintenant),
    commandeDeConfirmation(userId, maintenant),
  ]
}

export async function semerLesCommandesDeFixture(
  baseDeDonnees: string,
  environnement: Record<string, string | undefined> = process.env
): Promise<void> {
  process.env.DATABASE_URL = baseDeDonnees
  const { prisma } = await import("../../lib/db")

  try {
    const { email } = identifiantsCompteAdmin(environnement)
    const administrateur = await prisma.user.findUnique({ where: { email } })
    if (administrateur === null) {
      throw new Error(
        `aucun compte administrateur « ${email} » : le semis du socle doit précéder les Commandes de fixture`
      )
    }

    const commandes = construireLesCommandesDeFixture(administrateur.id)
    for (const commande of commandes) {
      const { items, id, userId, ...donnees } = commande
      await prisma.order.upsert({
        where: { id },
        update: {
          ...donnees,
          userId,
          items: { deleteMany: {}, create: items },
        },
        create: { id, userId, ...donnees, items: { create: items } },
      })
    }

    console.log(
      `[sonde] Commandes de fixture semées : ${NUMERO_DE_LA_COMMANDE_LIVREE} (Livrée, ${TOTAL_DE_LA_COMMANDE_LIVREE} centimes) et ${NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION} (deux Articles)`
    )
  } finally {
    await prisma.$disconnect()
  }
}
