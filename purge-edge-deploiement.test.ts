import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { load } from "js-yaml"
import { afterEach, describe, expect, it } from "vitest"

const RACINE = import.meta.dirname
const COMPOSE = path.join(RACINE, "docker-compose.yml")
const DOCKERFILE = path.join(RACINE, "Dockerfile")
const EXEMPLE_ENV = path.join(RACINE, ".env.example")
const NOTES = path.join(RACINE, "README.md")
const SCRIPT = path.join(RACINE, "scripts", "purger-edge.mjs")
const FAUX_CLOUDFLARE = path.join(RACINE, "test", "faux-cloudflare.mjs")

const ZONE = "zone-de-test"
const JETON = "jeton-de-test"
const CHEMIN_PURGE = `https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache`

type Objet = Record<string, unknown>

function estObjet(valeur: unknown): valeur is Objet {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)
}

function compose(): Objet {
  const lu = load(readFileSync(COMPOSE, "utf8"))
  if (!estObjet(lu)) throw new Error("docker-compose.yml illisible")
  return lu
}

function service(nom: string): Objet {
  const services = compose().services
  if (!estObjet(services) || !estObjet(services[nom])) {
    throw new Error(`docker-compose.yml ne définit aucun service « ${nom} »`)
  }
  return services[nom]
}

function dependances(nom: string): Objet {
  const trouvees = service(nom).depends_on
  return estObjet(trouvees) ? trouvees : {}
}

function dependance(nomService: string, nomDependance: string): Objet {
  const trouvee = dependances(nomService)[nomDependance]
  if (!estObjet(trouvee)) {
    throw new Error(
      `le service « ${nomService} » ne dépend pas de « ${nomDependance} »`
    )
  }
  return trouvee
}

function instructionsDuDockerfile(): { commande: string; arguments: string }[] {
  return readFileSync(DOCKERFILE, "utf8")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "" && !ligne.startsWith("#"))
    .map((ligne) => {
      const [commande = "", ...reste] = ligne.split(/\s+/)
      return { commande: commande.toUpperCase(), arguments: reste.join(" ") }
    })
}

function instructionsDeLEtape(nom: string): string[] {
  const instructions: string[] = []
  let dedans = false
  for (const instruction of instructionsDuDockerfile()) {
    if (instruction.commande === "FROM") {
      dedans = new RegExp(`\\bAS\\s+${nom}$`, "i").test(instruction.arguments)
      continue
    }
    if (dedans)
      instructions.push(`${instruction.commande} ${instruction.arguments}`)
  }
  return instructions
}

function commandeDuService(nom: string): unknown {
  return service(nom).command
}

describe("la composition purge la zone entre la migration et l'application", () => {
  it("déclare la purge comme un service one-shot après la migration", () => {
    const purge = service("purge-edge")

    expect(purge.restart).toBe("no")
    expect(dependance("purge-edge", "migrate").condition).toBe(
      "service_completed_successfully"
    )
    expect(
      dependance("purge-edge", "migrate").required,
      "une dépendance facultative laisse la purge ignorer la migration."
    ).not.toBe(false)
    expect(commandeDuService("purge-edge")).toEqual([
      "node",
      "scripts/purger-edge.mjs",
    ])
  })

  it("construit la purge sur la cible qui porte le script, sans toucher la runner", () => {
    const build = service("purge-edge").build

    expect(estObjet(build) ? build.target : undefined).toBe("migrate")
    expect(
      instructionsDeLEtape("migrate"),
      "la cible migrate ne copie plus tout le contexte : le script de purge peut manquer dans l'image."
    ).toContain("COPY . .")
  })

  it("fait attendre l'application à la purge, et non directement à la migration", () => {
    const attente = dependance("app", "purge-edge")

    expect(attente.condition).toBe("service_completed_successfully")
    expect(
      dependances("app"),
      "une dépendance directe app → migrate contourne la purge : l'application peut prendre le trafic avant elle."
    ).not.toHaveProperty("migrate")
    expect(
      attente.required,
      "une dépendance facultative laisse l'application démarrer sans purge."
    ).not.toBe(false)
  })

  it("nomme le script que la commande exécute, et le script purge tout", () => {
    expect(existsSync(SCRIPT)).toBe(true)
    expect(readFileSync(SCRIPT, "utf8")).toContain("purge_everything")
  })

  it("transmet la zone, le jeton et l'interrupteur à la purge", () => {
    const environnement = service("purge-edge").environment
    const brut = Array.isArray(environnement)
      ? environnement.join("\n")
      : JSON.stringify(environnement)

    expect(brut).toContain("CLOUDFLARE_ZONE_ID")
    expect(brut).toContain("CLOUDFLARE_API_TOKEN")
    expect(brut).toContain("PURGE_EDGE")
  })
})

interface Capture {
  url: string
  method: string | undefined
  headers: Record<string, string>
  body: string
}

interface Execution {
  statut: number | null
  sortie: string
  captures: Capture[]
}

const DOSSIERS: string[] = []

afterEach(() => {
  for (const dossier of DOSSIERS.splice(0)) {
    rmSync(dossier, { recursive: true, force: true })
  }
})

function environnementDePurge(
  variables: Record<string, string | undefined>
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.CLOUDFLARE_ZONE_ID
  delete env.CLOUDFLARE_API_TOKEN
  delete env.PURGE_EDGE
  delete env.FAUX_CLOUDFLARE_MODE
  delete env.FAUX_CLOUDFLARE_CAPTURE
  for (const [nom, valeur] of Object.entries(variables)) {
    if (valeur === undefined) {
      delete env[nom]
    } else {
      env[nom] = valeur
    }
  }
  return env
}

function lancerLaPurge(
  variables: Record<string, string | undefined>
): Execution {
  const dossier = mkdtempSync(path.join(tmpdir(), "purge-edge-"))
  DOSSIERS.push(dossier)
  const capture = path.join(dossier, "appels.jsonl")

  const execution = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(FAUX_CLOUDFLARE).href, SCRIPT],
    {
      cwd: RACINE,
      env: environnementDePurge({
        FAUX_CLOUDFLARE_CAPTURE: capture,
        ...variables,
      }),
      encoding: "utf8",
      timeout: 20_000,
    }
  )

  const captures = existsSync(capture)
    ? readFileSync(capture, "utf8")
        .split("\n")
        .filter((ligne) => ligne !== "")
        .map((ligne) => JSON.parse(ligne) as Capture)
    : []

  return {
    statut: execution.status,
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
    captures,
  }
}

const CREDENTIALS = {
  CLOUDFLARE_ZONE_ID: ZONE,
  CLOUDFLARE_API_TOKEN: JETON,
}

describe("le script de purge se tait sans crédential et échoue quand Cloudflare échoue", () => {
  it("ne fait rien, et le dit, sans zone ni jeton", () => {
    const execution = lancerLaPurge({})

    expect(execution.statut).toBe(0)
    expect(execution.sortie).toContain("ignorée")
    expect(execution.sortie).toContain("CLOUDFLARE_ZONE_ID")
    expect(execution.captures).toEqual([])
  })

  it("ne fait rien quand PURGE_EDGE=off, même avec les crédentials", () => {
    const execution = lancerLaPurge({ ...CREDENTIALS, PURGE_EDGE: "off" })

    expect(execution.statut).toBe(0)
    expect(execution.sortie).toContain("ignorée")
    expect(execution.sortie).toContain("PURGE_EDGE")
    expect(execution.captures).toEqual([])
  })

  it("vide la zone entière en un seul appel idempotent", () => {
    const execution = lancerLaPurge(CREDENTIALS)

    expect(execution.statut).toBe(0)
    expect(execution.captures).toHaveLength(1)

    const [appel] = execution.captures
    expect(appel?.url).toBe(CHEMIN_PURGE)
    expect(appel?.method).toBe("POST")
    expect(appel?.headers.Authorization).toBe(`Bearer ${JETON}`)
    expect(appel?.headers["Content-Type"]).toBe("application/json")
    expect(JSON.parse(String(appel?.body))).toEqual({ purge_everything: true })
    expect(execution.sortie).not.toContain(JETON)
  })

  it("relancer la purge réussit de nouveau, sans état à réinitialiser", () => {
    const premiere = lancerLaPurge(CREDENTIALS)
    const seconde = lancerLaPurge(CREDENTIALS)

    expect(premiere.statut).toBe(0)
    expect(seconde.statut).toBe(0)
    expect(seconde.captures.map((appel) => JSON.parse(appel.body))).toEqual([
      { purge_everything: true },
    ])
  })

  it("échoue quand l'API refuse la requête", () => {
    const execution = lancerLaPurge({
      ...CREDENTIALS,
      FAUX_CLOUDFLARE_MODE: "echec-http",
    })

    expect(execution.statut).toBe(1)
    expect(execution.sortie).toContain("ECHEC")
    expect(execution.sortie).toContain("403")
    expect(execution.captures).toHaveLength(1)
  })

  it("échoue quand Cloudflare répond success:false", () => {
    const execution = lancerLaPurge({
      ...CREDENTIALS,
      FAUX_CLOUDFLARE_MODE: "echec-metier",
    })

    expect(execution.statut).toBe(1)
    expect(execution.sortie).toContain("ECHEC")
    expect(execution.sortie).toContain("Invalid zone identifier")
  })

  it("échoue quand le transport ne répond pas", () => {
    const execution = lancerLaPurge({
      ...CREDENTIALS,
      FAUX_CLOUDFLARE_MODE: "reseau",
    })

    expect(execution.statut).toBe(1)
    expect(execution.sortie).toContain("ECHEC")
  })
})

describe("l'exploitant trouve la crédential, l'ordre et le retour arrière", () => {
  const notes = readFileSync(NOTES, "utf8")
  const exemple = readFileSync(EXEMPLE_ENV, "utf8")

  it("documente la purge, ses variables et son désengagement", () => {
    expect(notes).toContain("purge-edge")
    expect(notes).toContain("service_completed_successfully")
    expect(notes).toContain("CLOUDFLARE_ZONE_ID")
    expect(notes).toContain("CLOUDFLARE_API_TOKEN")
    expect(notes).toContain("Cache Purge")
    expect(notes).toContain("PURGE_EDGE=off")
    expect(exemple).toContain("PURGE_EDGE")
  })

  it("dit la fenêtre résiduelle au lieu de la nier", () => {
    expect(notes).toMatch(/fenêtre résiduelle/i)
    expect(notes).toMatch(/ancien conteneur|old container/i)
  })
})
