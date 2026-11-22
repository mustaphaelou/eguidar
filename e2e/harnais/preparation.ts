import "dotenv/config"

import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { RACINE } from "./artefact"
import { semerLesCommandesDeFixture } from "./commandes-de-fixture"
import {
  CHEMINS_DES_IMAGES_DE_LA_FICHE,
  semerLaFicheDeProduction,
} from "./fiche-de-production"
import { environnementDeBuild } from "./serveur"

const TABLES_A_TRONQUER = [
  "user",
  "session",
  "account",
  "verification",
  "Category",
  "Product",
  "ProductVariant",
  "BrouillonImageProduit",
  "ImageProduit",
  "CartItem",
  "Order",
  "OrderItem",
  "DeliveryCity",
  "ShippingSettings",
  "Theme",
  "ArticleBlog",
  "ArticleBlogProduit",
  "AutomationEvent",
  "AutomationRule",
  "AutomationRuleRevision",
  "AutomationRun",
] as const

export const IMAGE_DE_FIXTURE = path.join(
  RACINE,
  "e2e",
  "fixtures",
  "image-produit-vedette.png"
)

export const CHEMIN_PUBLIC_DE_L_IMAGE = "/e2e/image-produit-vedette.png"

function environnement(baseDeDonnees: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_URL: baseDeDonnees,
    NEXT_TELEMETRY_DISABLED: "1",
  }
}

function executer(
  commande: string,
  arguments_: readonly string[],
  baseDeDonnees: string
): void {
  execFileSync(commande, arguments_, {
    cwd: RACINE,
    env: environnement(baseDeDonnees),
    stdio: "inherit",
  })
}

function copierLImagePublique(): void {
  for (const chemin of CHEMINS_DES_IMAGES_DE_LA_FICHE) {
    const destination = path.join(RACINE, "public", chemin)
    mkdirSync(path.dirname(destination), { recursive: true })
    if (
      existsSync(destination) &&
      readFileSync(destination).equals(readFileSync(IMAGE_DE_FIXTURE))
    ) {
      continue
    }
    copyFileSync(IMAGE_DE_FIXTURE, destination)
  }
}

async function tronquerLaBase(baseDeDonnees: string): Promise<void> {
  process.env.DATABASE_URL = baseDeDonnees
  const { prisma } = await import("../../lib/db")
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES_A_TRONQUER.map((table) => `"${table}"`).join(", ")} CASCADE`
  )
  await prisma.$disconnect()
}

export async function poserLaFixture(baseDeDonnees: string): Promise<void> {
  copierLImagePublique()
  process.env.DATABASE_URL = baseDeDonnees
  const { prisma } = await import("../../lib/db")

  const produit = await prisma.product.findFirst({
    where: { isFeatured: true },
    orderBy: [{ featuredOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, slug: true },
  })
  if (produit === null) {
    await prisma.$disconnect()
    throw new Error(
      "aucun Produit en Mise en avant : les Données de démonstration n'ont pas été semées avant l'image de fixture"
    )
  }

  await prisma.product.update({
    where: { id: produit.id },
    data: { images: [CHEMIN_PUBLIC_DE_L_IMAGE] },
  })

  await semerLaFicheDeProduction(prisma)

  const { toIndexableProduct } = await import("../../lib/index-projection")
  const { indexProductDocuments } = await import("../../lib/meili")
  const produits = await prisma.product.findMany({
    include: { variants: true, category: true },
  })
  await indexProductDocuments(produits.map(toIndexableProduct))
  await prisma.$disconnect()

  console.log(
    `[sonde] image de fixture attachée à ${produit.slug} (${CHEMIN_PUBLIC_DE_L_IMAGE}) et index de recherche reconstruit`
  )

  await semerLesCommandesDeFixture(baseDeDonnees)
}

export async function preparerLaBase(baseDeDonnees: string): Promise<void> {
  const debut = Date.now()
  executer("npx", ["prisma", "migrate", "deploy"], baseDeDonnees)
  await tronquerLaBase(baseDeDonnees)
  executer("npx", ["prisma", "db", "seed"], baseDeDonnees)
  executer("npx", ["tsx", "prisma/seed-demo.ts"], baseDeDonnees)
  await poserLaFixture(baseDeDonnees)
  const secondes = Math.round((Date.now() - debut) / 1000)
  console.log(`[sonde] base préparée en ${secondes} s`)
}

export function construireLArtefact(
  baseDeDonnees: string,
  origine: string,
  redisUrl: string | null
): void {
  const debut = Date.now()
  execFileSync("npm", ["run", "build"], {
    cwd: RACINE,
    env: environnementDeBuild(baseDeDonnees, origine, redisUrl),
    stdio: "inherit",
  })
  const secondes = Math.round((Date.now() - debut) / 1000)
  console.log(`[sonde] build terminé en ${secondes} s`)
}
