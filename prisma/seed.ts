import "dotenv/config"

import { randomUUID } from "node:crypto"

import { hashPassword } from "better-auth/crypto"

import { prisma } from "../lib/db"
import { indexProductDocuments } from "../lib/meili"
import { toIndexableProduct } from "../lib/index-projection"
import { slugify } from "../lib/slug"
import { identifiantsCompteAdmin } from "./compte-admin"

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
  { name: "Smartphones", slug: "smartphones" },
  { name: "Ordinateurs & Tablettes", slug: "ordinateurs-tablettes" },
  { name: "Audio & Hi-Fi", slug: "audio-hifi" },
  { name: "TV & Home Cinema", slug: "tv-home-cinema" },
  { name: "Gaming", slug: "gaming" },
  { name: "Accessoires", slug: "accessoires" },
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
    specs: {
      Écran: '6.1" Super Retina XDR',
      Puce: "A17 Pro",
      Caméra: "48 MP",
      Batterie: "3274 mAh",
    },
    images: [],
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
      'Le flagship Samsung : écran 6,8" AMOLED, S Pen intégré, caméra 200 MP et 7 ans de mises à jour. TVA 20% incluse.',
    brand: "Samsung",
    category: "smartphones",
    price: 1199900,
    isFeatured: true,
    featuredOrder: 2,
    specs: {
      Écran: '6.8" AMOLED 120 Hz',
      Puce: "Snapdragon 8 Gen 3",
      Caméra: "200 MP",
      Batterie: "5000 mAh",
    },
    images: [],
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
    specs: {
      Écran: '13.6" Liquid Retina',
      Puce: "Apple M3",
      RAM: "8 Go",
      Stockage: "256 Go SSD",
    },
    images: [],
    variants: [
      { name: "8 Go / 256 Go", sku: "MBA13M3-8-256", priceDelta: 0, stock: 7 },
      {
        name: "8 Go / 512 Go",
        sku: "MBA13M3-8-512",
        priceDelta: 200000,
        stock: 5,
      },
      {
        name: "16 Go / 512 Go",
        sku: "MBA13M3-16-512",
        priceDelta: 400000,
        stock: 3,
      },
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
    specs: {
      Écran: '13.4" OLED',
      Processeur: "Intel Core Ultra 7",
      RAM: "16 Go",
      Stockage: "512 Go SSD",
    },
    images: [],
    variants: [
      {
        name: "Modèle standard",
        sku: "XPS13-ULTRA7-16-512",
        priceDelta: 0,
        stock: 4,
      },
    ],
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
    specs: {
      Type: "Circum-aural",
      Bluetooth: "5.2",
      Autonomie: "30 h",
      Réduction: "ANC adaptative",
    },
    images: [],
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
    specs: {
      Bluetooth: "5.1",
      Puissance: "40 W RMS",
      Autonomie: "20 h",
      Étanchéité: "IP67",
    },
    images: [],
    variants: [
      { name: "Noir", sku: "JBLCH5-NOIR", priceDelta: 0, stock: 20 },
      { name: "Bleu", sku: "JBLCH5-BLEU", priceDelta: 0, stock: 12 },
    ],
  },
  {
    name: 'TV Samsung 55" QLED 4K',
    slug: "tv-samsung-55-qled-4k",
    description:
      "Téléviseur QLED 4K avec Quantum Processor, HDR10+ et Tizen Smart TV. TVA 20% incluse.",
    brand: "Samsung",
    category: "tv-home-cinema",
    price: 699900,
    specs: {
      Taille: '55"',
      Résolution: "4K UHD",
      Technologie: "QLED",
      HDR: "HDR10+",
    },
    images: [],
    variants: [{ name: "55 pouces", sku: "TV55Q60D", priceDelta: 0, stock: 6 }],
  },
  {
    name: 'TV LG OLED 65" C4',
    slug: "tv-lg-oled-65-c4",
    description:
      "Téléviseur OLED avec a9 Gen7 AI Processor, Dolby Vision et webOS. TVA 20% incluse.",
    brand: "LG",
    category: "tv-home-cinema",
    price: 1899900,
    isFeatured: true,
    featuredOrder: 5,
    freeShipping: true,
    specs: {
      Taille: '65"',
      Résolution: "4K UHD",
      Technologie: "OLED evo",
      HDR: "Dolby Vision",
    },
    images: [],
    variants: [
      { name: "65 pouces", sku: "LGOLED65C4", priceDelta: 0, stock: 3 },
    ],
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
    specs: {
      Stockage: "1 To SSD",
      Résolution: "4K 120 Hz",
      Lecteur: "Blu-ray 4K",
    },
    images: [],
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
    images: [],
    variants: [
      { name: "Blanc", sku: "ANKER65W-BLANC", priceDelta: 0, stock: 30 },
      { name: "Noir", sku: "ANKER65W-NOIR", priceDelta: 0, stock: 25 },
    ],
  },
]

interface ArticleDeDemo {
  titre: string
  slug: string
  extrait: string
  couverture: string | null
  contenu: string
  theme: "guides" | "annonces"
  publishedAt: Date
}

const articlesDeBlog = [
  {
    titre: "Bien choisir son smartphone",
    slug: "bien-choisir-son-smartphone",
    extrait:
      "Écran, autonomie, photo : les critères qui comptent vraiment au moment d'acheter un smartphone.",
    couverture: "/blog/guide-smartphone-couverture.png",
    theme: "guides",
    publishedAt: new Date("2026-10-15T09:00:00.000Z"),
    contenu: `Un smartphone se choisit sur trois axes : ce qu'on voit, ce qu'on touche et ce qui tient la journée. Le reste — les modes photo, les promesses d'intelligence artificielle — se découvre après l'achat.

## L'écran et la prise en main

La taille de l'écran ne dit rien du confort. Un format de 6,1 pouces bien proportionné se tient d'une main, là où un 6,8 pouces glisse des poches étroites.

![Un smartphone tenu d'une main devant un fond clair](/blog/guide-smartphone-figure-1.png "La prise en main compte plus que les chiffres de la fiche technique.")

- Privilégier un écran OLED pour la lisibilité en plein soleil.
- Vérifier la fréquence de rafraîchissement, agréable au défilement.
- Comparer l'autonomie annoncée à celle des tests indépendants.
- Tenir compte du poids, surtout au-delà de 200 grammes.

## L'autonomie et la recharge

Une batterie de 5000 mAh ne garantit rien sans une puce économe. Les modèles récents tiennent la journée, mais la recharge rapide reste le vrai confort du quotidien.

> Le meilleur smartphone est celui qu'on ne recharge pas deux fois par jour.

![Un chargeur USB-C branché à un smartphone posé sur un bureau](/blog/guide-smartphone-figure-2.png "Une recharge rapide change l'usage plus qu'un gain de capacité.")

## Le budget

Fixez une enveloppe avant de regarder les modèles : le milieu de gamme couvre la plupart des usages, et la différence de prix se joue souvent sur la photo et la finition.`,
  },
  {
    titre: "Ce que nous vérifions avant de mettre un produit en ligne",
    slug: "nos-criteres-avant-de-mettre-un-produit-en-ligne",
    extrait:
      "Nos critères de sélection, du premier essai à la mise en rayon, pour ne vendre que ce qui tient ses promesses.",
    couverture: null,
    theme: "guides",
    publishedAt: new Date("2026-10-08T09:00:00.000Z"),
    contenu: `Un produit n'entre pas au catalogue parce qu'il est disponible chez un fournisseur. Il y entre parce que nous l'avons essayé, comparé et jugé digne de la place qu'il occupera dans la boutique.

Nous commençons par les usages réels : un téléphone qui tient deux jours en usage courant, un ordinateur qui reste silencieux en visioconférence, un casque qu'on peut porter une heure sans gêne. Les fiches techniques servent à vérifier, pas à convaincre.

Vient ensuite le service : disponibilité des pièces, durée de la garantie, sérieux du réseau de réparation. Un bon produit mal suivi devient un mauvais achat, et c'est souvent ce qui distingue deux modèles au même prix.

Enfin, nous écoutons les retours de la boutique. Un modèle qui revient trop souvent est retiré, même s'il se vend bien : la confiance d'un client compte plus qu'une marge ponctuelle.`,
  },
  {
    titre: "La boutique Eguidar ouvre ses portes",
    slug: "la-boutique-eguidar-ouvre-ses-portes",
    extrait:
      "La boutique Eguidar ouvre ses portes à Casablanca : venez voir, comparer et repartir avec le bon produit.",
    couverture: "/blog/annonce-boutique-couverture.png",
    theme: "annonces",
    publishedAt: new Date("2026-10-22T09:00:00.000Z"),
    contenu: `La boutique Eguidar ouvre ses portes à Casablanca. Vous pouvez y voir les produits du catalogue, les prendre en main et comparer les modèles avant de commander.

Nos conseillers sont sur place pour vous aider à choisir selon votre budget et vos usages. Les commandes passées en ligne peuvent être retirées sur place dès le lendemain.`,
  },
] satisfies ArticleDeDemo[]

async function main() {
  const { email: adminEmail, motDePasse: adminPassword } =
    identifiantsCompteAdmin()

  await prisma.shippingSettings.upsert({
    where: { id: "default" },
    update: { freeShippingThreshold: 100000 },
    create: { id: "default", freeShippingThreshold: 100000 },
  })

  for (const city of cities) {
    await prisma.deliveryCity.upsert({
      where: { name: city.name },
      update: { fee: city.fee },
      create: { ...city, slug: slugify(city.name) },
    })
  }

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    })
  }

  for (const product of products) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: product.category },
    })
    const { variants, category: _category, images, ...productData } = product
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: { ...productData, categoryId: category.id },
      create: { ...productData, images, categoryId: category.id },
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

  for (const theme of [
    { slug: "guides", nom: "Guides" },
    { slug: "annonces", nom: "Annonces" },
  ] as const) {
    await prisma.theme.upsert({
      where: { slug: theme.slug },
      update: { nom: theme.nom },
      create: theme,
    })
  }

  for (const article of articlesDeBlog) {
    const { theme, ...articleData } = article
    await prisma.articleBlog.upsert({
      where: { slug: article.slug },
      update: {
        ...articleData,
        statut: "publie",
        theme: { connect: { slug: theme } },
      },
      create: {
        ...articleData,
        statut: "publie",
        theme: { connect: { slug: theme } },
      },
    })
  }

  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  })
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

  console.log(
    "Seed terminé : villes, catégories, produits, variantes, Articles de blog et compte admin créés."
  )
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
