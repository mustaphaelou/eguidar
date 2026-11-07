import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PrismaClient } from "@/lib/generated/prisma/client"

/**
 * Ce que la base de `eguidar_test` ne peut pas prouver : le Socle rejoué sur
 * une base qui sert déjà, avec un Catalogue et un Blog dedans.
 *
 * Le fichier possède donc sa propre base — créée, migrée puis jetée — pour
 * qu'aucune rangée laissée par une autre suite ne décide du résultat.
 */
const RACINE = path.resolve(import.meta.dirname, "..")
const NOM_BASE = "eguidar_test_socle"
const URL_SOCLE = urlDe(NOM_BASE)
const URL_MAINTENANCE = urlDe("postgres")

function urlDe(nom: string): string {
  const url = new URL(process.env.TEST_DATABASE_URL!)
  url.pathname = `/${nom}`
  return url.toString()
}

function client(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

function lancer(
  commande: string,
  args: string[],
  env: Record<string, string>
): { status: number | null; sortie: string } {
  const execution = spawnSync(commande, args, {
    cwd: RACINE,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, ...env },
  })

  return {
    status: execution.status,
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
  }
}

const marque = randomUUID().slice(0, 8)
const EMAIL_ADMIN = `socle-${marque}@exemple.test`

let socle: PrismaClient

beforeAll(async () => {
  const maintenance = client(URL_MAINTENANCE)
  await maintenance.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS "${NOM_BASE}" WITH (FORCE)`
  )
  await maintenance.$executeRawUnsafe(`CREATE DATABASE "${NOM_BASE}"`)
  await maintenance.$disconnect()

  const migration = lancer(
    "npx",
    ["--no-install", "prisma", "migrate", "deploy"],
    { DATABASE_URL: URL_SOCLE }
  )
  expect(migration.status, migration.sortie).toBe(0)

  socle = client(URL_SOCLE)
}, 180_000)

afterAll(async () => {
  await socle?.$disconnect()

  const maintenance = client(URL_MAINTENANCE)
  await maintenance
    .$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOM_BASE}" WITH (FORCE)`)
    .catch(() => {})
  await maintenance.$disconnect()
})

describe("le Socle rejoué sur une base qui sert déjà", () => {
  it("laisse le Catalogue et le Blog intacts, et n'écrit que le Socle", async () => {
    const theme = await socle.theme.create({
      data: { slug: `theme-${marque}`, nom: `Guides ${marque}` },
    })
    const categorie = await socle.category.create({
      data: { slug: `structure-${marque}`, name: "Audio" },
    })
    const produit = await socle.product.create({
      data: {
        name: "Enceinte de recette",
        slug: `produit-${marque}`,
        description: "desc",
        brand: "Marque",
        price: 129900,
        specs: { Puissance: "40 W" },
        images: [],
        categoryId: categorie.id,
        variants: {
          create: {
            name: "Noir",
            sku: `SKU-${marque}`,
            priceDelta: 0,
            stock: 3,
          },
        },
      },
    })
    const article = await socle.articleBlog.create({
      data: {
        titre: "Article de recette",
        slug: `article-${marque}`,
        extrait: "extrait",
        contenu: "contenu",
        themeId: theme.id,
        statut: "publie",
      },
    })

    // Les migrations posent déjà les deux Thèmes du Blog : le compte de
    // départ n'est donc pas zéro, et c'est le compte relu qui fait foi.
    const themesAvant = await socle.theme.count()
    const structuresAvant = await socle.category.count()
    const produitsAvant = await socle.product.count()

    const seed = lancer(
      process.execPath,
      ["--import", "tsx", "prisma/seed.ts"],
      {
        DATABASE_URL: URL_SOCLE,
        ADMIN_EMAIL: EMAIL_ADMIN,
        ADMIN_PASSWORD: "mot-de-passe-de-recette",
        ADMIN_NAME: "Recette",
      }
    )

    expect(seed.status, seed.sortie).toBe(0)
    expect(seed.sortie).toContain("Seed terminé")

    const catalogue = await socle.product.findUniqueOrThrow({
      where: { id: produit.id },
      include: { variants: true },
    })
    expect(catalogue).toMatchObject({
      price: 129900,
      name: "Enceinte de recette",
      description: "desc",
      brand: "Marque",
      specs: { Puissance: "40 W" },
    })
    expect(catalogue.variants).toHaveLength(1)
    expect(catalogue.variants[0]).toMatchObject({
      sku: `SKU-${marque}`,
      stock: 3,
      priceDelta: 0,
    })

    expect(
      await socle.articleBlog.findUnique({ where: { id: article.id } })
    ).toMatchObject({ titre: "Article de recette", statut: "publie" })

    expect(
      await socle.category.findUnique({ where: { id: categorie.id } })
    ).toMatchObject({
      name: "Audio",
      slug: `structure-${marque}`,
    })

    // Aucune ligne de plus : le seed n'a ni semé un Catalogue, ni remplacé
    // celui qui existait.
    expect(await socle.product.count()).toBe(produitsAvant)
    expect(await socle.category.count()).toBe(structuresAvant)
    expect(await socle.theme.count()).toBe(themesAvant)

    // Et le Socle est bien écrit — sans quoi ce test ne prouverait que le
    // seed n'a rien fait du tout.
    const administrateur = await socle.user.findUniqueOrThrow({
      where: { email: EMAIL_ADMIN },
      include: { accounts: true },
    })
    expect(administrateur).toMatchObject({ role: "admin", name: "Recette" })
    // Better Auth retrouve le Compte à mot de passe par `accountId === user.id` :
    // sans cette égalité, la sonde ne peut pas se connecter au compte semé.
    expect(administrateur.accounts).toContainEqual(
      expect.objectContaining({
        providerId: "credential",
        accountId: administrateur.id,
      })
    )
    expect(await socle.deliveryCity.count()).toBe(10)
    expect(
      await socle.shippingSettings.findUnique({ where: { id: "default" } })
    ).not.toBeNull()
  }, 120_000)

  it("déplace le Compte credential semé vers `accountId = user.id`", async () => {
    const email = `socle-ancien-${marque}@exemple.test`
    const id = randomUUID()
    await socle.user.create({
      data: {
        id,
        name: "Ancien",
        email,
        emailVerified: true,
        role: "admin",
      },
    })
    const ancien = await socle.account.create({
      data: {
        id: randomUUID(),
        accountId: email,
        providerId: "credential",
        userId: id,
        password: "hash-conserve",
      },
    })

    const seed = lancer(
      process.execPath,
      ["--import", "tsx", "prisma/seed.ts"],
      {
        DATABASE_URL: URL_SOCLE,
        ADMIN_EMAIL: email,
        ADMIN_PASSWORD: "mot-de-passe-de-recette",
        ADMIN_NAME: "Ancien",
      }
    )

    expect(seed.status, seed.sortie).toBe(0)
    const comptes = await socle.account.findMany({
      where: { userId: id, providerId: "credential" },
    })
    expect(comptes).toHaveLength(1)
    expect(comptes[0]).toMatchObject({
      id: ancien.id,
      accountId: id,
      password: "hash-conserve",
    })
  }, 120_000)

  it("ne fait pas entrer en collision l'ancien Compte et le Compte canonique", async () => {
    const email = `socle-doublon-${marque}@exemple.test`
    const id = randomUUID()
    await socle.user.create({
      data: {
        id,
        name: "Doublon",
        email,
        emailVerified: true,
        role: "admin",
      },
    })
    // Une base qui a déjà réparé la connexion porte le Compte canonique à côté
    // de l'ancienne ligne semée (`accountId = email`). Rejouer le Socle ne doit
    // pas les faire entrer en collision sur `account_providerId_accountId_key`.
    await socle.account.createMany({
      data: [
        {
          id: randomUUID(),
          accountId: email,
          providerId: "credential",
          userId: id,
          password: "hash-ancien",
        },
        {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          userId: id,
          password: "hash-canonique",
        },
      ],
    })

    const seed = lancer(
      process.execPath,
      ["--import", "tsx", "prisma/seed.ts"],
      {
        DATABASE_URL: URL_SOCLE,
        ADMIN_EMAIL: email,
        ADMIN_PASSWORD: "mot-de-passe-de-recette",
        ADMIN_NAME: "Doublon",
      }
    )

    expect(seed.status, seed.sortie).toBe(0)
    const comptes = await socle.account.findMany({
      where: { userId: id, providerId: "credential" },
    })
    // Le seed ne supprime aucune ligne : l'ancienne reste, le Compte canonique
    // aussi, avec son mot de passe intact.
    expect(comptes).toHaveLength(2)
    expect(comptes.filter((compte) => compte.accountId === id)).toHaveLength(1)
    expect(comptes.find((compte) => compte.accountId === id)?.password).toBe(
      "hash-canonique"
    )
  }, 120_000)
})
