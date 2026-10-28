import "dotenv/config"

import { execSync } from "node:child_process"

const TEST_TABLES = [
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
] as const

export default async function globalSetup() {
  const testDbUrl = process.env.TEST_DATABASE_URL
  if (!testDbUrl) throw new Error("TEST_DATABASE_URL is not set")

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: "inherit",
  })

  process.env.DATABASE_URL = testDbUrl

  const { prisma } = await import("@/lib/db")
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TEST_TABLES.map((table) => `"${table}"`).join(", ")} CASCADE`
  )
  await prisma.$disconnect()
}
