import { spawn, type ChildProcess } from "node:child_process"
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

import { SLUG_DE_REPLI } from "@/lib/parametre-de-repli"

/**
 * Le serveur de production démarré pour de vrai, interrogé comme un opérateur :
 * un en-tête `cache-control`, un document rendu, une charge utile RSC. Aucun
 * import de Next, aucune assertion de composant.
 */

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

/**
 * En CI, l'artefact est le sujet du test : son absence doit faire échouer la
 * sonde, pas la sauter. En local, un `npm run build` peut manquer sans que le
 * reste de la suite mente ; le saut reste alors visible.
 */
const BUILD_ATTENDU = process.env.CATALOGUE_DE_BUILD_ATTENDU === "1"

/** La valeur que le cookie `panier-visiteur` porte : des articles, pas un identifiant. */
const ARTICLE_DU_COOKIE = "variant-anonymat-761"
const COOKIE_PANIER = JSON.stringify([
  { variantId: ARTICLE_DU_COOKIE, quantity: 2 },
])

/**
 * Un cookie de Session courante factice : better-auth rejette la signature,
 * donc ce test prouve qu'un porteur de cookie de session reçoit le même
 * document — pas qu'une Session *valide* ne fuit pas. Cette moitié est tenue
 * par `components/storefront/header.test.tsx`, qui rend la coquille avec
 * `cookies()` et `headers()` qui lèvent.
 */
const COOKIE_SESSION = "better-auth.session_token=jeton-de-test-761.signature"

/** Les deux états vides de l'Aperçu, tels que #746 les a nommés. */
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

/** Le premier slug que le build a réellement prérendu, lu dans l'artefact. */
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

/**
 * Un slug absent de l'artefact saute en local — visiblement — mais fait échouer
 * la sonde en CI : une sous-assertion sautée ne prouve rien.
 */
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

/** Le même arrangement que le Dockerfile : standalone, static, public, handlers. */
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
    } catch {
      // Le serveur n'écoute pas encore.
    }
    await new Promise((resoudre) =>
      setTimeout(resoudre, INTERVALLE_DE_SONDE_MS)
    )
  }
  throw new Error(
    `pas de 200 sur /faq en ${DELAI_DE_BOOT_MS} ms\n${journalDuServeur.join("\n")}`
  )
}

/** Suit les redirections à la main : la 307 de `RSC: 1` conserve l'en-tête. */
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

function cacheControl(reponse: ReponseLue): string {
  return reponse.entetes.get("cache-control") ?? ""
}

/** Un document que l'edge a le droit de stocker, rendu par l'origine sans report. */
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
      // Le catalogue de la CI ne sème aucun article publiable : cette
      // sous-assertion reste un saut visible, même sous le drapeau de CI.
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
      // Un document constant par URL : ni compteur, ni texte de panier, ni
      // identité de Client ne peuvent y entrer.
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

      // ADR-0011 : le document est déjà peint quand `notFound()` répond, donc
      // le statut reste 200 et c'est `noindex` qui tient le slug hors de l'index.
      expect(reponse.statut).toBe(200)
      expect(reponse.entetes.get("content-type")).toMatch(/^text\/html/)
      expect(reponse.corps).toMatch(/<meta name="robots" content="noindex"/)
      expect(reponse.corps).toContain("Page introuvable")
      // Un slug inconnu n'est pas prérendu : l'origine le rend à la demande,
      // et l'edge ne doit pas le stocker.
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
  }
)
