import "dotenv/config"

import { randomUUID } from "node:crypto"

import { semerLesRegles } from "../lib/automations/regles"
import { prisma } from "../lib/db"
import { hacherMotDePasse } from "../lib/mot-de-passe-hache"
import { slugify } from "../lib/slug"
import { identifiantsCompteAdmin } from "./compte-admin"

/**
 * Le socle : ce qu'une installation doit posséder pour servir, et rien de
 * plus — les réglages de livraison, le réseau de Villes de livraison, le
 * compte administrateur et les règles d'automatisation.
 *
 * Le Catalogue et le Blog n'en font pas partie. Ils vivent dans
 * [`seed-demo.ts`](./seed-demo.ts), que le déploiement n'appelle jamais : la
 * cible `migrate` de l'image ne lance que ce fichier-ci (ADR-0050).
 */
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

  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  })
  if (adminUser) {
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: "admin", emailVerified: true, name: adminName },
    })
    // Better Auth retrouve un Compte à mot de passe par `accountId === user.id` :
    // une base semée avant cette règle garde sinon un compte credential que la
    // connexion ne retrouve pas. La réparation ne supprime aucune ligne : une
    // base qui porte déjà le Compte canonique à côté de l'ancien (deux lignes
    // credential, `accountId` = email et `accountId` = user.id) ne doit pas les
    // faire entrer en collision sur `account_providerId_accountId_key`.
    const canonical = await prisma.account.findFirst({
      where: { providerId: "credential", accountId: adminUser.id },
      select: { id: true, password: true },
    })
    if (canonical) {
      // Le Compte que Better Auth cherche existe. Si le mot de passe vivait
      // seulement sur l'ancienne ligne, il est recopié — sans quoi la connexion
      // resterait impossible malgré le bon `accountId`.
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
      // Aucun Compte canonique : l'ancienne ligne la plus récente devient la
      // ligne canonique. Une seule ligne est modifiée, donc pas de collision.
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
