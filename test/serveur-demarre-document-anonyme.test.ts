import { spawn, type ChildProcess } from "node:child_process"
import { createHash, createHmac } from "node:crypto"
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Readable } from "node:stream"

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest"

import { prisma } from "@/lib/db"
import { SLUG_DE_REPLI } from "@/lib/parametre-de-repli"

const RACINE = path.resolve(import.meta.dirname, "..")
const ARTEFACT = path.join(RACINE, ".next", "standalone")
const BUILD_ID = path.join(RACINE, ".next", "BUILD_ID")
const SERVEUR = path.join(ARTEFACT, "server.js")
const PRODUITS_PRERENDUS = path.join(
  RACINE,
  ".next",
  "server",
  "app",
  "produit"
)
const CATEGORIES_PRERENDUES = path.join(
  RACINE,
  ".next",
  "server",
  "app",
  "categorie"
)
const ARTICLES_PRERENDUS = path.join(RACINE, ".next", "server", "app", "blog")

const DELAI_DE_BOOT_MS = 90_000
const INTERVALLE_DE_SONDE_MS = 250

const BUILD_ATTENDU = process.env.CATALOGUE_DE_BUILD_ATTENDU === "1"

const ARTICLE_DU_COOKIE = "variant-anonymat-761"
const COOKIE_PANIER = JSON.stringify([
  { variantId: ARTICLE_DU_COOKIE, quantity: 2 },
])

const COOKIE_SESSION = "better-auth.session_token=jeton-de-test-761.signature"

const TEXTES_DU_PANIER = [
  "Votre panier est vide",
  "Connectez-vous pour retrouver le panier de votre compte.",
]

interface ReponseLue {
  statut: number
  entetes: Headers
  corps: string
}

function raisonSansBuild(): string | null {
  const absents = [
    ...(existsSync(BUILD_ID) ? [] : [".next/BUILD_ID"]),
    ...(existsSync(SERVEUR) ? [] : [".next/standalone/server.js"]),
  ]
  if (absents.length === 0) return null
  return `build de production absent (${absents.join(" et ")}) — lancez \`npm run build\` pour que ce test s'exécute`
}

const RAISON_SANS_BUILD = raisonSansBuild()

if (RAISON_SANS_BUILD !== null) {
  if (BUILD_ATTENDU) {
    throw new Error(
      `${RAISON_SANS_BUILD} ; CATALOGUE_DE_BUILD_ATTENDU=1 exige cet artefact`
    )
  }
  console.warn(`[serveur-document-anonyme] test ignoré : ${RAISON_SANS_BUILD}`)
}

function premierSlugPrerendu(
  dossier: string,
  extensions: readonly string[]
): string | null {
  if (!existsSync(dossier)) return null
  const slugs = readdirSync(dossier)
    .filter((fichier) =>
      extensions.some((extension) => fichier.endsWith(extension))
    )
    .map((fichier) => fichier.slice(0, fichier.lastIndexOf(".")))
    .filter((slug) => slug !== "[slug]" && slug !== SLUG_DE_REPLI)
    .filter((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
  return slugs.sort()[0] ?? null
}

const PRODUIT =
  RAISON_SANS_BUILD === null
    ? premierSlugPrerendu(PRODUITS_PRERENDUS, [".rsc", ".html"])
    : null
const CATEGORIE =
  RAISON_SANS_BUILD === null
    ? premierSlugPrerendu(CATEGORIES_PRERENDUES, [".rsc", ".html"])
    : null
const ARTICLE_DE_BLOG =
  RAISON_SANS_BUILD === null
    ? premierSlugPrerendu(ARTICLES_PRERENDUS, [".rsc"])
    : null

const ENTETE_DOCUMENT_CACHEABLE =
  /^s-maxage=900(?:, stale-while-revalidate=\d+)?$/

const RAISON_SANS_PRODUIT =
  "aucun produit prérendu dans .next/server/app/produit — la sous-assertion catalogue est ignorée"
const RAISON_SANS_CATEGORIE =
  "aucune catégorie prérendue dans .next/server/app/categorie — la sous-assertion catégorie est ignorée"
const RAISON_SANS_ARTICLE =
  "aucun Article de blog prérendu dans .next/server/app/blog — la sous-assertion blog est ignorée"
const RAISON_ARTEFACT_PARTIEL =
  "le build de CI doit prérendre au moins un produit et une catégorie"

function exigerLeSlug(
  leContexte: TestContext,
  slug: string | null,
  raison: string
): slug is string {
  if (slug !== null) return true
  if (BUILD_ATTENDU) {
    throw new Error(`${raison} ; ${RAISON_ARTEFACT_PARTIEL}`)
  }
  leContexte.skip(raison)
  return false
}

async function portLibre(): Promise<number> {
  const sonde = createServer()
  await new Promise<void>((resoudre, rejeter) => {
    sonde.once("error", rejeter)
    sonde.listen(0, "127.0.0.1", () => resoudre())
  })
  const adresse = sonde.address()
  await new Promise<void>((resoudre, rejeter) => {
    sonde.close((erreur) => (erreur ? rejeter(erreur) : resoudre()))
  })
  if (adresse === null || typeof adresse === "string") {
    throw new Error("le port libre choisi est illisible")
  }
  return adresse.port
}

function copierLArtefact(): string {
  const dossier = mkdtempSync(path.join(tmpdir(), "eguidar-761-"))
  const standalone = path.join(dossier, "standalone")
  cpSync(ARTEFACT, standalone, { recursive: true })
  cpSync(
    path.join(RACINE, ".next", "static"),
    path.join(standalone, ".next", "static"),
    {
      recursive: true,
    }
  )
  cpSync(path.join(RACINE, "public"), path.join(standalone, "public"), {
    recursive: true,
  })
  cpSync(
    path.join(RACINE, "cache-handlers"),
    path.join(standalone, "cache-handlers"),
    {
      recursive: true,
    }
  )
  return standalone
}

function environnement(port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    NEXT_PUBLIC_BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    NEXT_TELEMETRY_DISABLED: "1",
  }
}

let serveur: ChildProcess | null = null
let dossierTemporaire: string | null = null
let base = ""

const journalDuServeur: string[] = []

function retenirLeJournal(flux: Readable | null): void {
  flux?.setEncoding("utf8")
  flux?.on("data", (morceau: string) => {
    journalDuServeur.push(
      ...morceau.split("\n").filter((ligne) => ligne !== "")
    )
    if (journalDuServeur.length > 60) {
      journalDuServeur.splice(0, journalDuServeur.length - 60)
    }
  })
}

async function attendreLeServeur(): Promise<void> {
  const echeance = Date.now() + DELAI_DE_BOOT_MS
  while (Date.now() < echeance) {
    if (serveur !== null && serveur.exitCode !== null) {
      throw new Error(
        `le serveur s'est arrêté au démarrage (code ${serveur.exitCode})\n${journalDuServeur.join("\n")}`
      )
    }
    try {
      const reponse = await fetch(`${base}/faq`, { redirect: "manual" })
      await reponse.arrayBuffer()
      if (reponse.status === 200) return
    } catch {}
    await new Promise((resoudre) =>
      setTimeout(resoudre, INTERVALLE_DE_SONDE_MS)
    )
  }
  throw new Error(
    `pas de 200 sur /faq en ${DELAI_DE_BOOT_MS} ms\n${journalDuServeur.join("\n")}`
  )
}

async function demander(
  chemin: string,
  entetes: Record<string, string> = {}
): Promise<ReponseLue> {
  let adresse = new URL(chemin, base)
  for (let redirections = 0; redirections <= 5; redirections += 1) {
    const reponse = await fetch(adresse, {
      headers: entetes,
      redirect: "manual",
    })
    const destination = reponse.headers.get("location")
    if (reponse.status >= 300 && reponse.status < 400 && destination !== null) {
      await reponse.arrayBuffer()
      adresse = new URL(destination, adresse)
      continue
    }
    return {
      statut: reponse.status,
      entetes: reponse.headers,
      corps: await reponse.text(),
    }
  }
  throw new Error(`trop de redirections pour ${chemin}`)
}

async function demanderSansSuivre(
  chemin: string,
  entetes: Record<string, string> = {}
): Promise<ReponseLue> {
  const reponse = await fetch(new URL(chemin, base), {
    headers: entetes,
    redirect: "manual",
  })
  return {
    statut: reponse.status,
    entetes: reponse.headers,
    corps: await reponse.text(),
  }
}

const MARQUEUR_ADMIN = "admin-disclosure-761"
const NOM_CLIENT_SONDE = `Client ${MARQUEUR_ADMIN}`
const COURRIEL_CLIENT_SONDE = `${MARQUEUR_ADMIN}@example.test`
const ADRESSE_CLIENT_SONDE = `${MARQUEUR_ADMIN} rue des Faux Temoins`
const TELEPHONE_CLIENT_SONDE = "0612345678"
const NOM_ARTICLE_SONDE = `Article ${MARQUEUR_ADMIN}`

const DONNEES_CLIENT_SONDE = [
  NOM_CLIENT_SONDE,
  COURRIEL_CLIENT_SONDE,
  ADRESSE_CLIENT_SONDE,
  TELEPHONE_CLIENT_SONDE,
  NOM_ARTICLE_SONDE,
] as const

const JETON_ADMIN_VALIDE = `admin-valide-${MARQUEUR_ADMIN}`
const JETON_ADMIN_REVOQUE = `admin-revoque-${MARQUEUR_ADMIN}`
const JETON_ADMIN_PERIME = `admin-perime-${MARQUEUR_ADMIN}`

function cookieDeSession(jeton: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? ""
  const signature = createHmac("sha256", secret).update(jeton).digest("base64")
  return `better-auth.session_token=${encodeURIComponent(`${jeton}.${signature}`)}`
}

function arbreRoute(segments: readonly string[]): string {
  let noeud: unknown[] = ["__PAGE__", {}]
  for (const segment of [...segments].reverse()) {
    noeud = [segment, { children: noeud }]
  }
  return encodeURIComponent(JSON.stringify(["", { children: noeud }]))
}

async function urlPartialRender(
  chemin: string,
  segments: readonly string[]
): Promise<string> {
  const arbre = arbreRoute(segments)
  const entree = `0,0,${arbre},0`
  const empreinte = createHash("sha256")
    .update(entree)
    .digest()
    .subarray(0, 12)
    .toString("base64url")
  return `${chemin}?_rsc=${empreinte}`
}

function entetesPartiels(segments: readonly string[], cookie: string) {
  return {
    cookie,
    rsc: "1",
    "next-router-state-tree": arbreRoute(segments),
  }
}

function annonceRedirection(reponse: ReponseLue): boolean {
  const destination = reponse.entetes.get("location") ?? ""
  return (
    (reponse.statut >= 300 &&
      reponse.statut < 400 &&
      destination.includes("open=login")) ||
    /NEXT_REDIRECT|open=login/.test(reponse.corps)
  )
}

function sansDonneesClient(reponse: ReponseLue): string[] {
  return DONNEES_CLIENT_SONDE.filter((donnee) => reponse.corps.includes(donnee))
}

function cacheControl(reponse: ReponseLue): string {
  return reponse.entetes.get("cache-control") ?? ""
}

function attendreUnDocumentCacheable(reponse: ReponseLue): void {
  expect(reponse.statut).toBe(200)
  expect(reponse.entetes.get("content-type")).toMatch(/^text\/html/)
  const entete = cacheControl(reponse)
  expect(entete).toMatch(ENTETE_DOCUMENT_CACHEABLE)
  expect(entete).not.toContain("no-store")
  expect(entete).not.toContain("private")
  expect(reponse.entetes.get("x-nextjs-postponed")).toBeNull()
}

describe.skipIf(RAISON_SANS_BUILD !== null)(
  "le serveur de production sert un document anonyme",
  () => {
    beforeAll(async () => {
      const standalone = copierLArtefact()
      dossierTemporaire = path.dirname(standalone)
      const port = await portLibre()
      base = `http://127.0.0.1:${port}`
      serveur = spawn(process.execPath, ["server.js"], {
        cwd: standalone,
        env: environnement(port),
        stdio: ["ignore", "pipe", "pipe"],
      })
      retenirLeJournal(serveur.stdout)
      retenirLeJournal(serveur.stderr)
      await attendreLeServeur()
    }, DELAI_DE_BOOT_MS)

    afterAll(async () => {
      const enfant = serveur
      serveur = null
      if (enfant !== null && enfant.exitCode === null) {
        enfant.kill("SIGKILL")
        await new Promise<void>((resoudre) => {
          if (enfant.exitCode !== null) return resoudre()
          enfant.once("exit", () => resoudre())
          setTimeout(resoudre, 5_000).unref()
        })
      }
      if (dossierTemporaire !== null) {
        rmSync(dossierTemporaire, { recursive: true, force: true })
        dossierTemporaire = null
      }
    })

    it("sert /faq comme un document partageable d'un an", async () => {
      const reponse = await demander("/faq")

      expect(reponse.statut).toBe(200)
      expect(reponse.entetes.get("content-type")).toMatch(/^text\/html/)
      expect(cacheControl(reponse)).toBe("s-maxage=31536000")
    })

    it("sert / et /blog comme des documents partageables, sans report", async () => {
      for (const chemin of ["/", "/blog"]) {
        attendreUnDocumentCacheable(await demander(chemin))
      }
    })

    it("sert un produit prérendu comme un document partageable", async (leContexte) => {
      if (!exigerLeSlug(leContexte, PRODUIT, RAISON_SANS_PRODUIT)) return

      attendreUnDocumentCacheable(await demander(`/produit/${PRODUIT}`))
    })

    it("sert une catégorie prérendue comme un document partageable, sans report", async (leContexte) => {
      if (!exigerLeSlug(leContexte, CATEGORIE, RAISON_SANS_CATEGORIE)) return

      attendreUnDocumentCacheable(await demander(`/categorie/${CATEGORIE}`))
    })

    it("sert un Article de blog prérendu comme un document partageable, sans report", async (leContexte) => {
      if (ARTICLE_DE_BLOG === null) {
        leContexte.skip(RAISON_SANS_ARTICLE)
        return
      }

      attendreUnDocumentCacheable(await demander(`/blog/${ARTICLE_DE_BLOG}`))
    })

    it("sert le même document à un visiteur sans panier, à un cookie qui porte des articles et à un porteur de cookie de session", async (leContexte) => {
      if (!exigerLeSlug(leContexte, PRODUIT, RAISON_SANS_PRODUIT)) return

      const sansCookie = await demander(`/produit/${PRODUIT}`)
      const avecCookie = await demander(`/produit/${PRODUIT}`, {
        cookie: `panier-visiteur=${encodeURIComponent(COOKIE_PANIER)}`,
      })
      const avecSession = await demander(`/produit/${PRODUIT}`, {
        cookie: COOKIE_SESSION,
      })

      expect(avecCookie.statut).toBe(200)
      expect(avecSession.statut).toBe(200)
      expect(avecCookie.corps).toBe(sansCookie.corps)
      expect(avecSession.corps).toBe(sansCookie.corps)

      for (const corps of [
        sansCookie.corps,
        avecCookie.corps,
        avecSession.corps,
      ]) {
        for (const texte of TEXTES_DU_PANIER) {
          expect(corps).not.toContain(texte)
        }
        expect(corps).not.toContain(ARTICLE_DU_COOKIE)
      }

      for (const reponse of [avecCookie, avecSession]) {
        expect(reponse.entetes.get("set-cookie")).toBeNull()
        expect((reponse.entetes.get("vary") ?? "").toLowerCase()).not.toContain(
          "cookie"
        )
      }
    })

    it("sert un slug inconnu comme la coquille soft-404 de l'origine, hors cache", async () => {
      const reponse = await demander("/produit/slug-inconnu-761")

      expect(reponse.statut).toBe(200)
      expect(reponse.entetes.get("content-type")).toMatch(/^text\/html/)
      expect(reponse.corps).toMatch(/<meta name="robots" content="noindex"/)
      expect(reponse.corps).toContain("Page introuvable")
      expect(cacheControl(reponse)).not.toContain("s-maxage")
    })

    it("répond à une requête RSC par une charge utile, et sans l'en-tête par un document", async () => {
      const document = await demander("/faq")
      expect(document.statut).toBe(200)
      expect(document.entetes.get("content-type")).toMatch(/^text\/html/)

      const charge = await demander("/faq", { rsc: "1" })
      expect(charge.statut).toBe(200)
      expect(charge.entetes.get("content-type")).toMatch(/^text\/x-component/)
    })

    describe("l'Administration refuse avant de lire", () => {
      let idCommande: string

      beforeAll(async () => {
        const adminId = `admin-${MARQUEUR_ADMIN}`
        const clientId = `client-${MARQUEUR_ADMIN}`
        const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000)

        await prisma.user.createMany({
          data: [
            {
              id: adminId,
              name: "Administrateur de la sonde",
              email: `${MARQUEUR_ADMIN}-admin@example.test`,
              emailVerified: true,
              role: "admin",
            },
            {
              id: clientId,
              name: NOM_CLIENT_SONDE,
              email: COURRIEL_CLIENT_SONDE,
              emailVerified: true,
              role: "user",
            },
          ],
        })

        const commande = await prisma.order.create({
          data: {
            userId: clientId,
            cityName: "Casablanca",
            address: ADRESSE_CLIENT_SONDE,
            phone: TELEPHONE_CLIENT_SONDE,
            total: 4200,
            shippingFee: 1500,
            totalPayable: 5700,
            items: {
              create: [
                {
                  productName: NOM_ARTICLE_SONDE,
                  variantName: "Taille unique",
                  price: 4200,
                  quantity: 1,
                },
              ],
            },
          },
        })
        idCommande = commande.id

        await prisma.session.createMany({
          data: [
            {
              id: `session-valide-${MARQUEUR_ADMIN}`,
              token: JETON_ADMIN_VALIDE,
              userId: adminId,
              expiresAt: expiration,
            },
            {
              id: `session-perimee-${MARQUEUR_ADMIN}`,
              token: JETON_ADMIN_PERIME,
              userId: adminId,
              expiresAt: expiration,
              createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
            },
          ],
        })
        await prisma.session.create({
          data: {
            id: `session-revoque-${MARQUEUR_ADMIN}`,
            token: JETON_ADMIN_REVOQUE,
            userId: adminId,
            expiresAt: expiration,
          },
        })
        await prisma.session.delete({
          where: { token: JETON_ADMIN_REVOQUE },
        })
      })

      afterAll(async () => {
        const adminId = `admin-${MARQUEUR_ADMIN}`
        const clientId = `client-${MARQUEUR_ADMIN}`

        await prisma.order.deleteMany({ where: { userId: clientId } })
        await prisma.session.deleteMany({
          where: { userId: { in: [adminId, clientId] } },
        })
        await prisma.user.deleteMany({
          where: { id: { in: [adminId, clientId] } },
        })
      })

      const chemins = () => [
        {
          nom: "la liste",
          chemin: "/admin/commandes",
          arbre: ["admin", "produits"],
          donneesAttendues: [NOM_CLIENT_SONDE, COURRIEL_CLIENT_SONDE],
        },
        {
          nom: "le détail",
          chemin: `/admin/commandes/${idCommande}`,
          arbre: ["admin", "commandes", "commande-precedente"],
          donneesAttendues: [...DONNEES_CLIENT_SONDE],
        },
      ]

      for (const [etiquette, jeton] of [
        ["un jeton forgé", `jeton-forge-${MARQUEUR_ADMIN}.signature`],
        ["une session révoquée", JETON_ADMIN_REVOQUE],
        ["une session hors durée", JETON_ADMIN_PERIME],
      ] as const) {
        it(`${etiquette} ne livre aucune donnée client, même en rendu partiel`, async () => {
          const cookie = cookieDeSession(jeton)

          for (const { nom, chemin, arbre } of chemins()) {
            const document = await demanderSansSuivre(chemin, { cookie })
            expect(sansDonneesClient(document), `${nom} — document`).toEqual([])
            expect(annonceRedirection(document), `${nom} — document`).toBe(true)

            const partiel = await demanderSansSuivre(
              await urlPartialRender(chemin, arbre),
              entetesPartiels(arbre, cookie)
            )
            expect(sansDonneesClient(partiel), `${nom} — partiel`).toEqual([])
            expect(annonceRedirection(partiel), `${nom} — partiel`).toBe(true)
          }
        })
      }

      it("une session d'administrateur valide livre les données sur les deux chemins", async () => {
        const cookie = cookieDeSession(JETON_ADMIN_VALIDE)

        for (const { nom, chemin, arbre, donneesAttendues } of chemins()) {
          const document = await demanderSansSuivre(chemin, { cookie })
          expect(document.statut, nom).toBe(200)
          for (const donnee of donneesAttendues) {
            expect(document.corps, `${nom} — ${donnee}`).toContain(donnee)
          }

          const partiel = await demanderSansSuivre(
            await urlPartialRender(chemin, arbre),
            entetesPartiels(arbre, cookie)
          )
          for (const donnee of donneesAttendues) {
            expect(partiel.corps, `${nom} — partiel — ${donnee}`).toContain(
              donnee
            )
          }
        }
      })
    })
  }
)
