import "dotenv/config"

import { identifiantsCompteAdmin } from "../../prisma/compte-admin"

/**
 * Les deux Commandes de fixture de la sonde, semées dans la base dédiée
 * **avant le build** (en local par `preparerLaBase`, en CI par l'étape de
 * fixture qui précède `npm run build`). Elles évitent de faire passer un achat
 * réel par le Checkout, qui déclencherait l'e-mail et les Automatisations.
 *
 * - `NUMERO_DE_LA_COMMANDE_LIVREE` : Livrée, un total fixe au-dessus de
 *   15 000 MAD, dans la fenêtre de 30 jours du CA encaissé (ADR-0009).
 * - `NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION` : deux Articles dont un nom long,
 *   et un statut non encaissé pour ne pas fausser le CA.
 *
 * Les identifiants sont fixes : aucune assertion ne dépend d'un identifiant
 * généré ou d'une date. Les deux Commandes appartiennent au compte
 * administrateur semé, sinon `getOrder` les rendrait introuvables (404).
 */

export const NUMERO_DE_LA_COMMANDE_LIVREE = "e2e-commande-livree-923"
export const NUMERO_DE_LA_COMMANDE_DE_CONFIRMATION =
  "e2e-commande-confirmation-923"

/** Le nom long que la page de confirmation doit afficher tel quel. */
export const NOM_LONG_DE_PRODUIT_DE_FIXTURE =
  "Ordinateur portable professionnel Apple MacBook Pro 16 pouces — puce M3 Max"
export const NOM_COURT_DE_PRODUIT_DE_FIXTURE = "Souris sans fil Bluetooth"

/** 1 599 800 centimes = 15 998,00 MAD, au-dessus du seuil de 15 000 MAD. */
export const TOTAL_DE_LA_COMMANDE_LIVREE = 1_599_800
export const TOTAL_DE_LA_COMMANDE_DE_CONFIRMATION = 3_299_000

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
        price: 2_999_000,
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

/** Les deux Commandes de la sonde, rattachées au compte administrateur. */
export function construireLesCommandesDeFixture(
  userId: string,
  maintenant: Date = new Date()
): CommandeDeFixture[] {
  return [
    commandeLivree(userId, maintenant),
    commandeDeConfirmation(userId, maintenant),
  ]
}

/**
 * Sème les deux Commandes dans la base de la sonde. Idempotent : la Commande
 * est remplacée par son état de fixture si elle existe déjà.
 */
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
