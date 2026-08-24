import "dotenv/config"

import { randomUUID } from "node:crypto"

import { hashPassword } from "better-auth/crypto"

import { prisma } from "../lib/db"
import { indexProductDocuments } from "../lib/meili"
import { toIndexableProduct } from "../lib/index-projection"

const adminEmail = process.env.ADMIN_EMAIL ?? "admin@eguidar.com"
const adminPassword = process.env.ADMIN_PASSWORD ?? "admin-password-change-me"
const adminName = process.env.ADMIN_NAME ?? "Administrateur"

const cities = [
  { name: "Casablanca", fee: 3000 },
  { name: "Rabat", fee: 3000 },
  { name: "Marrakech", fee: 3500 },
  { name: "Fès", fee: 3500 },
  { name: "Tanger", fee: 3500 },
  { name: "Agadir", fee: 4000 },
  { name: "Meknès", fee: 3500 },
  { name: "Oujda", fee: 4000 },
  { name: "Kénitra", fee: 3500 },
  { name: "Tétouan", fee: 4000 },
]

const categories = [
  { name: "Smartphones", slug: "smartphones", image: "https://placehold.co/800x800?text=Smartphones" },
  { name: "Ordinateurs & Tablettes", slug: "ordinateurs-tablettes", image: "https://placehold.co/800x800?text=Ordinateurs" },
  { name: "Audio & Hi-Fi", slug: "audio-hifi", image: "https://placehold.co/800x800?text=Audio" },
  { name: "TV & Home Cinema", slug: "tv-home-cinema", image: "https://placehold.co/800x800?text=TV" },
  { name: "Gaming", slug: "gaming", image: "https://placehold.co/800x800?text=Gaming" },
  { name: "Accessoires", slug: "accessoires", image: "https://placehold.co/800x800?text=Accessoires" },
]

const products = [
  {
    name: "iPhone 15 Pro",
    slug: "iphone-15-pro",
    description:
      "Le smartphone Apple le plus avancé : puce A17 Pro, titane, écran Super Retina XDR et caméra 48 MP. TVA 20% incluse.",
    brand: "Apple",
    category: "smartphones",
    price: 1249900,
    isFeatured: true,
    featuredOrder: 1,
    specs: { Écran: '6.1" Super Retina XDR', Puce: "A17 Pro", Caméra: "48 MP", Batterie: "3274 mAh" },
    images: ["https://placehold.co/800x800?text=iPhone+15+Pro"],
    variants: [
      { name: "128 Go", sku: "IP15P-128", priceDelta: 0, stock: 12 },
      { name: "256 Go", sku: "IP15P-256", priceDelta: 150000, stock: 8 },
      { name: "512 Go", sku: "IP15P-512", priceDelta: 350000, stock: 4 },
    ],
  },
  {
    name: "Samsung Galaxy S24 Ultra",
    slug: "samsung-galaxy-s24-ultra",
    description:
      "Le flagship Samsung : écran 6,8\" AMOLED, S Pen intégré, caméra 200 MP et 7 ans de mises à jour. TVA 20% incluse.",
    brand: "Samsung",
    category: "smartphones",
    price: 1199900,
    isFeatured: true,
    featuredOrder: 2,
    specs: { Écran: '6.8" AMOLED 120 Hz', Puce: "Snapdragon 8 Gen 3", Caméra: "200 MP", Batterie: "5000 mAh" },
    images: ["https://placehold.co/800x800?text=Galaxy+S24+Ultra"],
    variants: [
      { name: "256 Go", sku: "S24U-256", priceDelta: 0, stock: 10 },
      { name: "512 Go", sku: "S24U-512", priceDelta: 150000, stock: 6 },
    ],
  },
  {
    name: "MacBook Air 13 M3",
    slug: "macbook-air-13-m3",
    description:
      "Ultraportable Apple : puce M3, écran Liquid Retina, autonomie jusqu'à 18 heures. TVA 20% incluse.",
    brand: "Apple",
    category: "ordinateurs-tablettes",
    price: 1399900,
    isFeatured: true,
    featuredOrder: 3,
    freeShipping: true,
    specs: { Écran: '13.6" Liquid Retina', Puce: "Apple M3", RAM: "8 Go", Stockage: "256 Go SSD" },
    images: ["https://placehold.co/800x800?text=MacBook+Air+M3"],
    variants: [
      { name: "8 Go / 256 Go", sku: "MBA13M3-8-256", priceDelta: 0, stock: 7 },
      { name: "8 Go / 512 Go", sku: "MBA13M3-8-512", priceDelta: 200000, stock: 5 },
      { name: "16 Go / 512 Go", sku: "MBA13M3-16-512", priceDelta: 400000, stock: 3 },
    ],
  },
  {
    name: "Dell XPS 13",
    slug: "dell-xps-13",
    description:
      "PC portable premium : écran InfinityEdge OLED, processeur Intel Core Ultra 7, châssis aluminium. TVA 20% incluse.",
    brand: "Dell",
    category: "ordinateurs-tablettes",
    price: 1699900,
    specs: { Écran: '13.4" OLED', Processeur: "Intel Core Ultra 7", RAM: "16 Go", Stockage: "512 Go SSD" },
    images: ["https://placehold.co/800x800?text=Dell+XPS+13"],
    variants: [{ name: "Modèle standard", sku: "XPS13-ULTRA7-16-512", priceDelta: 0, stock: 4 }],
  },
  {
    name: "Casque Sony WH-1000XM5",
    slug: "sony-wh-1000xm5",
    description:
      "Casque sans fil à réduction de bruit active de référence, 30 h d'autonomie et charge rapide. TVA 20% incluse.",
    brand: "Sony",
    category: "audio-hifi",
    price: 349900,
    isFeatured: true,
    featuredOrder: 4,
    specs: { Type: "Circum-aural", Bluetooth: "5.2", Autonomie: "30 h", Réduction: "ANC adaptative" },
    images: ["https://placehold.co/800x800?text=WH-1000XM5"],
    variants: [
      { name: "Noir", sku: "WH1000XM5-NOIR", priceDelta: 0, stock: 15 },
      { name: "Argent", sku: "WH1000XM5-ARG", priceDelta: 0, stock: 9 },
    ],
  },
  {
    name: "Enceinte JBL Charge 5",
    slug: "jbl-charge-5",
    description:
      "Enceinte Bluetooth étanche IP67, 20 h de lecture et powerbank intégrée. TVA 20% incluse.",
    brand: "JBL",
    category: "audio-hifi",
    price: 159900,
    specs: { Bluetooth: "5.1", Puissance: "40 W RMS", Autonomie: "20 h", Étanchéité: "IP67" },
    images: ["https://placehold.co/800x800?text=JBL+Charge+5"],
    variants: [
      { name: "Noir", sku: "JBLCH5-NOIR", priceDelta: 0, stock: 20 },
      { name: "Bleu", sku: "JBLCH5-BLEU", priceDelta: 0, stock: 12 },
    ],
  },
  {
    name: "TV Samsung 55\" QLED 4K",
    slug: "tv-samsung-55-qled-4k",
    description:
      "Téléviseur QLED 4K avec Quantum Processor, HDR10+ et Tizen Smart TV. TVA 20% incluse.",
    brand: "Samsung",
    category: "tv-home-cinema",
    price: 699900,
    specs: { Taille: '55"', Résolution: "4K UHD", Technologie: "QLED", HDR: "HDR10+" },
    images: ["https://placehold.co/800x800?text=TV+Samsung+55"],
    variants: [{ name: "55 pouces", sku: "TV55Q60D", priceDelta: 0, stock: 6 }],
  },
  {
    name: "TV LG OLED 65\" C4",
    slug: "tv-lg-oled-65-c4",
    description:
      "Téléviseur OLED avec a9 Gen7 AI Processor, Dolby Vision et webOS. TVA 20% incluse.",
    brand: "LG",
    category: "tv-home-cinema",
    price: 1899900,
    isFeatured: true,
    featuredOrder: 5,
    freeShipping: true,
    specs: { Taille: '65"', Résolution: "4K UHD", Technologie: "OLED evo", HDR: "Dolby Vision" },
    images: ["https://placehold.co/800x800?text=TV+LG+OLED"],
    variants: [{ name: "65 pouces", sku: "LGOLED65C4", priceDelta: 0, stock: 3 }],
  },
  {
    name: "PlayStation 5 Slim",
    slug: "playstation-5-slim",
    description:
      "Console Sony avec lecteur Blu-ray, manette DualSense et jeu pré-installé. TVA 20% incluse.",
    brand: "Sony",
    category: "gaming",
    price: 549900,
    isFeatured: true,
    featuredOrder: 6,
    specs: { Stockage: "1 To SSD", Résolution: "4K 120 Hz", Lecteur: "Blu-ray 4K" },
    images: ["https://placehold.co/800x800?text=PS5+Slim"],
    variants: [
      { name: "Avec lecteur", sku: "PS5SLIM-BD", priceDelta: 0, stock: 8 },
      { name: "Digital", sku: "PS5SLIM-DIG", priceDelta: -60000, stock: 5 },
    ],
  },
  {
    name: "Chargeur Anker 65W USB-C",
    slug: "chargeur-anker-65w-usb-c",
    description:
      "Chargeur GaN 65 W double port USB-C, compatible smartphone et ordinateur. TVA 20% incluse.",
    brand: "Anker",
    category: "accessoires",
    price: 39900,
    specs: { Puissance: "65 W", Ports: "2x USB-C", Technologie: "GaN II" },
    images: ["https://placehold.co/800x800?text=Anker+65W"],
    variants: [
      { name: "Blanc", sku: "ANKER65W-BLANC", priceDelta: 0, stock: 30 },
      { name: "Noir", sku: "ANKER65W-NOIR", priceDelta: 0, stock: 25 },
    ],
  },
]

async function main() {
  await prisma.shippingSettings.upsert({
    where: { id: "default" },
    update: { freeShippingThreshold: 100000 },
    create: { id: "default", freeShippingThreshold: 100000 },
  })

  for (const city of cities) {
    await prisma.deliveryCity.upsert({
      where: { name: city.name },
      update: { fee: city.fee },
      create: city,
    })
  }

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, image: category.image },
      create: category,
    })
  }

  for (const product of products) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: product.category },
    })
    const { variants, category: _category, ...productData } = product
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: { ...productData, categoryId: category.id },
      create: { ...productData, categoryId: category.id },
    })
    for (const variant of variants) {
      await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: { ...variant, product: { connect: { slug: product.slug } } },
        create: {
          ...variant,
          product: { connect: { slug: product.slug } },
        },
      })
    }
  }

  const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (adminUser) {
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: "admin", emailVerified: true, name: adminName },
    })
  } else {
    const password = await hashPassword(adminPassword)
    await prisma.user.create({
      data: {
        id: randomUUID(),
        email: adminEmail,
        name: adminName,
        emailVerified: true,
        role: "admin",
        accounts: {
          create: {
            id: randomUUID(),
            providerId: "credential",
            accountId: adminEmail,
            password,
          },
        },
      },
    })
  }

  await indexProductDocuments(
    (
      await prisma.product.findMany({
        include: { variants: true, category: true },
      })
    ).map(toIndexableProduct)
  )

  console.log("Seed terminé : villes, catégories, produits, variantes et compte admin créés.")
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
