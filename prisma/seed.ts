import "dotenv/config"

import { randomUUID } from "node:crypto"

import { semerLesRegles } from "../lib/automations/regles"
import { prisma } from "../lib/db"
import { hacherMotDePasse } from "../lib/mot-de-passe-hache"
import { slugify } from "../lib/slug"
import { hasUniqueViolation } from "../lib/use-cases/unique-violation"
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

async function main() {
  const { email: adminEmail, motDePasse: adminPassword } =
    identifiantsCompteAdmin()

  try {
    await prisma.shippingSettings.create({
      data: { id: "default", freeShippingThreshold: 100000 },
    })
  } catch (error) {
    if (!hasUniqueViolation(error, ["id"])) throw error
  }

  for (const city of cities) {
    try {
      await prisma.deliveryCity.create({
        data: { ...city, slug: slugify(city.name) },
      })
    } catch (error) {
      if (
        !hasUniqueViolation(error, ["name"]) &&
        !hasUniqueViolation(error, ["slug"])
      ) {
        throw error
      }
    }
  }

  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  })
  if (adminUser) {
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: "admin", emailVerified: true },
    })
    const canonical = await prisma.account.findFirst({
      where: { providerId: "credential", accountId: adminUser.id },
      select: { id: true, password: true },
    })
    if (canonical) {
      if (!canonical.password) {
        const legacy = await prisma.account.findFirst({
          where: {
            userId: adminUser.id,
            providerId: "credential",
            password: { not: null },
            id: { not: canonical.id },
          },
          orderBy: { updatedAt: "desc" },
          select: { password: true },
        })
        if (legacy?.password) {
          await prisma.account.update({
            where: { id: canonical.id },
            data: { password: legacy.password },
          })
        }
      }
    } else {
      const legacy = await prisma.account.findFirst({
        where: { userId: adminUser.id, providerId: "credential" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      })
      if (legacy) {
        await prisma.account.update({
          where: { id: legacy.id },
          data: { accountId: adminUser.id },
        })
      }
    }
  } else {
    const password = await hacherMotDePasse(adminPassword)
    const adminId = randomUUID()
    await prisma.user.create({
      data: {
        id: adminId,
        email: adminEmail,
        name: adminName,
        emailVerified: true,
        role: "admin",
        accounts: {
          create: {
            id: randomUUID(),
            providerId: "credential",
            accountId: adminId,
            password,
          },
        },
      },
    })
  }

  await semerLesRegles()

  console.log(
    "Seed terminé : réglages de livraison, Villes de livraison, compte admin et règles d'automatisation en place."
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
