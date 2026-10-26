import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

import { load } from "js-yaml"
import { describe, expect, it } from "vitest"

import { estObjet, lireLesJobs } from "./scripts/ci-liste"

const RACINE = import.meta.dirname

const DOCKERFILE = path.join(RACINE, "Dockerfile")
const COMPOSE = path.join(RACINE, "docker-compose.yml")
const FLUX = path.join(RACINE, ".github", "workflows", "ci.yml")
const EXEMPLE_ENV = path.join(RACINE, ".env.example")
const NOTES = path.join(RACINE, "README.md")

const ID_DU_SECRET = "database_url"
const VARIABLE_DE_BUILD = "DATABASE_URL_BUILD"

type Instruction = { commande: string; arguments: string }
type Etape = { nom: string; instructions: Instruction[] }

function instructionsDuDockerfile(): Instruction[] {
  const instructions: Instruction[] = []
  let enCours: string | null = null

  for (const ligneBrute of readFileSync(DOCKERFILE, "utf8").split("\n")) {
    const ligne = ligneBrute.trim()
    if (ligne === "" || ligne.startsWith("#")) continue

    const complete: string = enCours === null ? ligne : `${enCours} ${ligne}`
    if (complete.endsWith("\\")) {
      enCours = complete.slice(0, -1).trim()
      continue
    }

    enCours = null
    const [commande = "", ...reste] = complete.split(/\s+/)
    instructions.push({
      commande: commande.toUpperCase(),
      arguments: reste.join(" "),
    })
  }
  return instructions
}

function etapesDuDockerfile(): Etape[] {
  const etapes: Etape[] = []
  for (const instruction of instructionsDuDockerfile()) {
    if (instruction.commande !== "FROM") {
      etapes.at(-1)?.instructions.push(instruction)
      continue
    }
    const nom = /\bAS\s+(\S+)$/i.exec(instruction.arguments)?.[1]
    if (nom === undefined) {
      throw new Error(`FROM sans nom d'étape : ${instruction.arguments}`)
    }
    etapes.push({ nom, instructions: [] })
  }
  return etapes
}

function etape(nom: string): Etape {
  const trouvee = etapesDuDockerfile().find((etape) => etape.nom === nom)
  if (trouvee === undefined) {
    throw new Error(`le Dockerfile ne définit aucune étape « ${nom} »`)
  }
  return trouvee
}

function texteDuFichier(chemin: string): string {
  return readFileSync(chemin, "utf8")
}

function compose(): Record<string, unknown> {
  const lu = load(texteDuFichier(COMPOSE))
  if (!estObjet(lu)) throw new Error("docker-compose.yml illisible")
  return lu
}

function service(nom: string): Record<string, unknown> {
  const services = compose().services
  if (!estObjet(services) || !estObjet(services[nom])) {
    throw new Error(`docker-compose.yml ne définit aucun service « ${nom} »`)
  }
  return services[nom] as Record<string, unknown>
}

function buildDuService(nom: string): Record<string, unknown> {
  const build = service(nom).build
  if (!estObjet(build)) {
    throw new Error(`le service « ${nom} » n'a pas de build lisible`)
  }
  return build
}

function sourcesDeSecrets(build: Record<string, unknown>): string[] {
  const secrets = build.secrets
  if (!Array.isArray(secrets)) return []
  return secrets.flatMap((secret) => {
    if (typeof secret === "string") return [secret]
    if (!estObjet(secret)) return []
    return typeof secret.source === "string" ? [secret.source] : []
  })
}

function etapesDuJob(nom: string): Record<string, unknown>[] {
  const etapes = lireLesJobs().get(nom)?.steps
  return Array.isArray(etapes) ? etapes.filter(estObjet) : []
}

function etapeSous(
  nom: string,
  predicat: (etape: Record<string, unknown>) => boolean
): Record<string, unknown> {
  const trouvee = etapesDuJob(nom).find(predicat)
  if (trouvee === undefined) {
    throw new Error(`le job « ${nom} » n'a aucune étape correspondante`)
  }
  return trouvee
}

function avec(etape: Record<string, unknown>): Record<string, unknown> {
  return estObjet(etape.with) ? etape.with : {}
}

function docker(...lesArguments: string[]): ReturnType<typeof spawnSync> {
  return spawnSync("docker", lesArguments, {
    encoding: "utf8",
    timeout: 20_000,
  })
}

describe("le Dockerfile monte le catalogue en secret de build", () => {
  it("fait lire la base au RUN qui construit, sans ARG ni ENV", () => {
    const builder = etape("builder")

    const construit = builder.instructions.find(
      (instruction) =>
        instruction.commande === "RUN" &&
        /\bnpm run build\b/.test(instruction.arguments)
    )

    expect(
      construit?.arguments,
      "le RUN de build ne monte pas le secret : le build ne peut pas lire le catalogue."
    ).toContain(`--mount=type=secret,id=${ID_DU_SECRET}`)
    expect(construit?.arguments).toContain("env=DATABASE_URL")

    const exposes = builder.instructions.filter(
      (instruction) =>
        (instruction.commande === "ARG" || instruction.commande === "ENV") &&
        /\bDATABASE_URL\b/.test(instruction.arguments)
    )

    expect(
      exposes.map(
        (instruction) => `${instruction.commande} ${instruction.arguments}`
      ),
      "une URL de catalogue est exposée en ARG ou ENV : elle persiste dans l'image."
    ).toEqual([])
  })

  it("garde le secret sur le RUN de build, et nulle part avant", () => {
    const builder = etape("builder")
    const monteLeSecret = builder.instructions.filter((instruction) =>
      instruction.arguments.includes("type=secret")
    )

    expect(monteLeSecret).toHaveLength(1)
    expect(monteLeSecret[0]?.arguments).toContain("npm run build")
  })
})

describe("la composition livre le secret de build sans l'écrire", () => {
  const build = buildDuService("app")

  it("déclare le secret sur le build de l'application", () => {
    expect(sourcesDeSecrets(build)).toContain(ID_DU_SECRET)
  })

  it("le fait venir de l'environnement de la composition, pas d'un build arg", () => {
    const secrets = compose().secrets
    expect(estObjet(secrets)).toBe(true)
    expect(estObjet(secrets) ? secrets[ID_DU_SECRET] : undefined).toEqual({
      environment: VARIABLE_DE_BUILD,
    })

    const args = build.args
    expect(estObjet(args) ? Object.keys(args) : []).not.toContain(
      "DATABASE_URL"
    )
    expect(JSON.stringify(build)).not.toMatch(/postgresql:\/\//)
  })

  it("donne au build le réseau de l'hôte, pour joindre le catalogue publié", () => {
    expect(build.network).toBe("host")
  })
})

describe("le job de build atteint un catalogue sans secret de dépôt", () => {
  const job = lireLesJobs().get("build")
  const etapes = etapesDuJob("build")

  it("garde l'étape de build et `contents: read`", () => {
    expect(etapes.map((etape) => etape.run)).toContain("npm run build")

    const flux = load(texteDuFichier(FLUX))
    expect(estObjet(flux) ? flux.permissions : undefined).toEqual({
      contents: "read",
    })
  })

  it("ne référence aucun secret de dépôt ni `GITHUB_TOKEN`", () => {
    const flux = texteDuFichier(FLUX)

    expect(flux).not.toMatch(/\$\{\{\s*secrets\./)
    expect(
      flux,
      "le flux ne doit plus exporter `GITHUB_TOKEN` : aucune lecture vivante du ruleset n'a lieu en CI, et un jeton de dépôt dans `npm test` élargit la surface de tout processus de test."
    ).not.toMatch(/GITHUB_TOKEN/)
  })

  it("migre et sème la base locale du job avant de construire", () => {
    const indexMigration = etapes.findIndex(
      (etape) => etape.run === "npx prisma migrate deploy"
    )
    const indexSeed = etapes.findIndex(
      (etape) => etape.run === "npx prisma db seed"
    )
    const indexBuild = etapes.findIndex(
      (etape) => etape.run === "npm run build"
    )

    expect(indexMigration).toBeGreaterThan(-1)
    expect(indexSeed).toBeGreaterThan(-1)
    expect(indexBuild).toBeGreaterThan(-1)
    expect(indexMigration).toBeLessThan(indexBuild)
    expect(indexSeed).toBeLessThan(indexBuild)

    const servicePostgres = job?.services
    const base = estObjet(servicePostgres)
      ? servicePostgres.postgres
      : undefined
    expect(
      estObjet(base) && estObjet(base.env) ? base.env.POSTGRES_DB : undefined
    ).toBe("eguidar_probe")
  })

  it("passe l'URL du catalogue au build hôte", () => {
    const build = etapeSous("build", (etape) => etape.run === "npm run build")
    const env = estObjet(build.env) ? build.env : {}

    expect(String(env.DATABASE_URL)).toContain("eguidar_probe")
  })

  it("livre le même catalogue à l'image par le mécanisme de secrets", () => {
    const image = etapeSous(
      "build",
      (etape) =>
        typeof etape.uses === "string" &&
        etape.uses.startsWith("docker/build-push-action@") &&
        avec(etape).target === "runner"
    )
    const withImage = avec(image)
    const secrets = String(withImage.secrets ?? "")

    expect(secrets).toContain(`${ID_DU_SECRET}=`)
    expect(secrets).toContain("eguidar_probe")
    expect(String(withImage["build-args"] ?? "")).not.toContain("DATABASE_URL")
    // Le build doit joindre le service `postgres` du job sur l'adresse de
    // l'hôte ; le driver `docker-container` ne sait pas résoudre `host-gateway`.
    expect(withImage["add-hosts"]).toBeUndefined()
    expect(secrets).toContain("127.0.0.1:5432")
    expect(String(withImage.network)).toBe("host")
  })

  it("donne au constructeur l'espace réseau de l'hôte", () => {
    const buildx = etapeSous(
      "build",
      (etape) =>
        typeof etape.uses === "string" &&
        etape.uses.startsWith("docker/setup-buildx-action@")
    )

    expect(String(avec(buildx)["driver-opts"] ?? "")).toContain("network=host")
  })
})

describe("le job de test n'exporte aucun jeton GitHub", () => {
  it("ne déclare aucun env sur l'étape `npm test`", () => {
    const etapeTest = etapeSous("test", (etape) => etape.run === "npm test")

    expect(
      etapeTest,
      "l'étape `npm test` ne doit déclarer aucun env : les services du job passent par l'env du job, et un env d'étape est le chemin par lequel `GITHUB_TOKEN` rentrerait."
    ).not.toHaveProperty("env")
  })
})

describe("l'exploitant sait quelle crédential chaque build utilise", () => {
  it("nomme le catalogue local de la CI et la variable du build Coolify", () => {
    const notes = texteDuFichier(NOTES)
    const exemple = texteDuFichier(EXEMPLE_ENV)

    expect(notes).toContain("eguidar_probe")
    expect(notes).toContain(VARIABLE_DE_BUILD)
    expect(notes).toContain(`--secret id=${ID_DU_SECRET}`)
    expect(exemple).toContain(`${VARIABLE_DE_BUILD}=`)
  })
})

describe("l'image construite ne conserve pas le secret", () => {
  const IMAGE = process.env.IMAGE_RUNNER ?? "eguidar-runner:ci"

  it("n'en laisse ni dans l'historique, ni dans l'environnement", (leContexte) => {
    if (docker("info").status !== 0) {
      leContexte.skip(
        "démon Docker indisponible : ni l'historique ni l'environnement de l'image ne peuvent être inspectés"
      )
      return
    }
    if (docker("image", "inspect", IMAGE).status !== 0) {
      leContexte.skip(
        `image ${IMAGE} absente : elle est construite par le job build de la CI, puis inspectée ici`
      )
      return
    }

    const historique = docker(
      "history",
      "--no-trunc",
      "--format",
      "{{.CreatedBy}}",
      IMAGE
    )
    expect(historique.status).toBe(0)
    expect(String(historique.stdout)).not.toMatch(/DATABASE_URL/)

    const configuration = docker(
      "inspect",
      "--format",
      "{{json .Config.Env}}",
      IMAGE
    )
    expect(configuration.status).toBe(0)
    expect(String(configuration.stdout)).not.toMatch(/DATABASE_URL/)

    const environnement = docker(
      "run",
      "--rm",
      "--entrypoint",
      "sh",
      IMAGE,
      "-c",
      "env"
    )
    expect(environnement.status).toBe(0)
    expect(String(environnement.stdout)).not.toMatch(/DATABASE_URL/)
  })
})
