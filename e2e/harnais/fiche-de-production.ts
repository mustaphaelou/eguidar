import type { PrismaClient } from "@/lib/generated/prisma/client"

export const SLUG_DE_LA_FICHE_DE_PRODUCTION = "sonde-fiche-production"
export const NOM_DE_LA_FICHE_DE_PRODUCTION = "Sonde Fiche Production"
export const PRIX_DE_BASE_DE_LA_FICHE = 1_799_990
export const ECART_DE_CHAQUE_VARIANTE_DE_LA_FICHE = 1_888_800
export const PRIX_DES_VARIANTES_DE_LA_FICHE =
  PRIX_DE_BASE_DE_LA_FICHE + ECART_DE_CHAQUE_VARIANTE_DE_LA_FICHE
export const CHEMINS_DES_IMAGES_DE_LA_FICHE = [
  "/e2e/image-produit-vedette.png",
  "/e2e/image-produit-vedette-2.png",
] as const

export async function semerLaFicheDeProduction(
  prisma: PrismaClient
): Promise<void> {
  const categorie = await prisma.category.findUniqueOrThrow({
    where: { slug: "smartphones" },
  })
  const variantes = [
    {
      name: "256 Go",
      sku: "SONDE-FICHE-256",
      priceDelta: ECART_DE_CHAQUE_VARIANTE_DE_LA_FICHE,
      stock: 0,
    },
    {
      name: "512 Go",
      sku: "SONDE-FICHE-512",
      priceDelta: ECART_DE_CHAQUE_VARIANTE_DE_LA_FICHE,
      stock: 1,
    },
  ]
  const donnees = {
    name: NOM_DE_LA_FICHE_DE_PRODUCTION,
    slug: SLUG_DE_LA_FICHE_DE_PRODUCTION,
    description: "",
    brand: "Eguidar",
    categoryId: categorie.id,
    price: PRIX_DE_BASE_DE_LA_FICHE,
    specs: {},
    images: [...CHEMINS_DES_IMAGES_DE_LA_FICHE],
    isFeatured: true,
    featuredOrder: 7,
    freeShipping: true,
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
  }

  await prisma.product.upsert({
    where: { slug: SLUG_DE_LA_FICHE_DE_PRODUCTION },
    update: {
      ...donnees,
      variants: { deleteMany: {}, create: variantes },
    },
    create: {
      ...donnees,
      variants: { create: variantes },
    },
  })
}
