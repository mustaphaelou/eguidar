import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, describe, expect, it } from "vitest"

const RACINE = path.resolve(import.meta.dirname, "..")
const SCRIPT = path.join(RACINE, "scripts", "setup-providers.sh")

const REGLES_R2 = (
  JSON.parse(
    readFileSync(path.join(RACINE, "infra", "regle-cycle-vie-r2.json"), "utf8")
  ) as { rules: unknown[] }
).rules

const REGLES_CACHE = (
  JSON.parse(
    readFileSync(path.join(RACINE, "infra", "regle-cache-edge.json"), "utf8")
  ) as { rules: unknown[] }
).rules

const REGLES_CORS = (
  JSON.parse(
    readFileSync(path.join(RACINE, "infra", "cors-r2.json"), "utf8")
  ) as { rules: unknown[] }
).rules

const CORPS_CACHE = JSON.stringify({ rules: REGLES_CACHE })

const CORPS_CORS = JSON.stringify({ rules: REGLES_CORS })

const QUESTION_SECONDE_CONFIRMATION_R2 =
  "Delete those rules and leave only the artifact's rule?"

const QUESTION_SECONDE_CONFIRMATION_CACHE =
  "Replace those foreign cache rules and leave only the artifact's rules?"

const QUESTION_SECONDE_CONFIRMATION_CORS =
  "Replace those foreign CORS rules and leave only the artifact's rules?"

const REGLES_R2_VIVANTES = JSON.stringify({ result: { rules: REGLES_R2 } })

const ENTETE = ["", "", "", "site-cle", "cle-secrete"]

const AVANT_CACHE = [...ENTETE, "jeton-r2", "compte-r2", "y", "", "n"]

const DOSSIER = mkdtempSync(path.join(tmpdir(), "setup-providers-"))
const STUBS = path.join(DOSSIER, "bin")
const MARQUEUR_PUT = path.join(DOSSIER, "put-effectue")
const MARQUEUR_CACHE_PUT = path.join(DOSSIER, "cache-put-effectue")
const MARQUEUR_CORS_PUT = path.join(DOSSIER, "cors-put-effectue")
const MARQUEUR_DRY_RUN = path.join(DOSSIER, "cache-dry-run-effectue")
const MARQUEUR_APPELS_CACHE = path.join(DOSSIER, "cache-appels")
const CORPS_GET = path.join(DOSSIER, "reponse-get.json")
const CACHE_AVANT = path.join(DOSSIER, "cache-avant.json")
const CACHE_APRES = path.join(DOSSIER, "cache-apres.json")
const CORS_AVANT = path.join(DOSSIER, "cors-avant.json")
const CORS_APRES = path.join(DOSSIER, "cors-apres.json")
const ENV_FILE = path.join(DOSSIER, "env")

mkdirSync(STUBS, { recursive: true })

writeFileSync(
  path.join(STUBS, "curl"),
  `#!/usr/bin/env bash
args=" $* "
if [[ "$args" == *"/r2/buckets/"*"/cors"* ]]; then
  if [[ "$args" == *" -X PUT "* ]]; then
    printf '%s' "\${!#}" > "$CURL_MARQUEUR_CORS_PUT"
    printf '{"success":true,"result":{}}'
    exit 0
  fi
  if [[ -n "\${CURL_ECHEC_LECTURE_CORS:-}" ]]; then
    echo "curl: (7) Failed to connect to api.cloudflare.com port 443" >&2
    exit 7
  fi
  if [[ -f "$CURL_MARQUEUR_CORS_PUT" && -s "$CURL_CORS_APRES" ]]; then
    printf '%s' "$(<"$CURL_CORS_APRES")"
  else
    printf '%s' "$(<"$CURL_CORS_AVANT")"
  fi
  exit 0
fi
if [[ "$args" == *"/r2/buckets/"*"/lifecycle"* ]]; then
  if [[ "$args" == *" -X PUT "* ]]; then
    printf '%s' "\${!#}" > "$CURL_MARQUEUR_PUT"
    printf '{"success":true,"result":{}}'
    exit 0
  fi
  if [[ -n "\${CURL_ECHEC_LECTURE:-}" ]]; then
    echo "curl: (7) Failed to connect to api.cloudflare.com port 443" >&2
    exit 7
  fi
  printf '%s' "$(<"$CURL_CORPS_GET")"
  exit 0
fi
if [[ "$args" == *"/rulesets/phases/"* ]]; then
  printf 'appel\\n' >> "$CURL_MARQUEUR_APPELS_CACHE"
  if [[ "$args" == *" -X PUT "* ]]; then
    if [[ "$args" == *"dry_run=true"* ]]; then
      printf '%s' "\${!#}" > "$CURL_MARQUEUR_DRY_RUN"
      if [[ -n "\${CURL_DRY_RUN_REFUSEE:-}" ]]; then
        printf '{"success":false,"errors":[{"code":20021,"message":"expression failed to parse"}]}'
      else
        printf '{"success":true,"result":{}}'
      fi
      exit 0
    fi
    printf '%s' "\${!#}" > "$CURL_MARQUEUR_CACHE_PUT"
    printf '%s' '{"success":true,"result":{"id":"ruleset-1","version":"2"}}'
    exit 0
  fi
  if [[ -n "\${CURL_ECHEC_LECTURE_CACHE:-}" ]]; then
    echo "curl: (7) Failed to connect to api.cloudflare.com port 443" >&2
    exit 7
  fi
  if [[ -f "$CURL_MARQUEUR_CACHE_PUT" && -s "$CURL_CACHE_APRES" ]]; then
    printf '%s' "$(<"$CURL_CACHE_APRES")"
    printf '\\n%s' "\${CURL_CACHE_CODE_APRES:-200}"
    exit 0
  fi
  printf '%s' "$(<"$CURL_CACHE_AVANT")"
  printf '\\n%s' "\${CURL_CACHE_CODE:-200}"
  exit 0
fi
echo "curl: URL inattendue: $*" >&2
exit 1
`,
  { mode: 0o755 }
)
for (const ouvreur of ["xdg-open", "open", "wslview", "explorer.exe"]) {
  writeFileSync(path.join(STUBS, ouvreur), "#!/usr/bin/env bash\nexit 0\n", {
    mode: 0o755,
  })
}

type Tour = {
  reponses: string[]
  corpsGet?: string
  cacheAvant?: unknown
  cacheApres?: unknown
  codeCache?: string
  corsAvant?: unknown
  corsApres?: unknown
  echecLecture?: boolean
  echecLectureCache?: boolean
  echecLectureCors?: boolean
  dryRunRefusee?: boolean
}

type Resultat = {
  sortie: string
  statut: number | null
  putEffectue: boolean
  dryRunEffectue: boolean
  cachePutEffectue: boolean
  corsPutEffectue: boolean
  corpsDryRun: string
  corpsCachePut: string
  corpsCorsPut: string
  appelsCache: string
}

function lancer(leTour: Tour): Resultat {
  writeFileSync(ENV_FILE, "")
  if (leTour.corpsGet !== undefined) writeFileSync(CORPS_GET, leTour.corpsGet)
  writeFileSync(
    CACHE_AVANT,
    JSON.stringify(leTour.cacheAvant ?? { result: { rules: [] } })
  )
  if (leTour.cacheApres !== undefined) {
    writeFileSync(CACHE_APRES, JSON.stringify(leTour.cacheApres))
  } else {
    rmSync(CACHE_APRES, { force: true })
  }
  writeFileSync(
    CORS_AVANT,
    JSON.stringify(
      leTour.corsAvant ?? { success: true, result: { rules: REGLES_CORS } }
    )
  )
  if (leTour.corsApres !== undefined) {
    writeFileSync(CORS_APRES, JSON.stringify(leTour.corsApres))
  } else {
    rmSync(CORS_APRES, { force: true })
  }
  for (const marqueur of [
    MARQUEUR_PUT,
    MARQUEUR_CACHE_PUT,
    MARQUEUR_CORS_PUT,
    MARQUEUR_DRY_RUN,
    MARQUEUR_APPELS_CACHE,
  ]) {
    rmSync(marqueur, { force: true })
  }

  const execution = spawnSync("bash", [SCRIPT], {
    input: `${leTour.reponses.join("\n")}\n`,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: "",
      CLOUDFLARE_ZONE_ID: "",
      PATH: `${STUBS}${path.delimiter}${process.env.PATH ?? ""}`,
      ENV_FILE,
      CURL_MARQUEUR_PUT: MARQUEUR_PUT,
      CURL_MARQUEUR_CACHE_PUT: MARQUEUR_CACHE_PUT,
      CURL_MARQUEUR_CORS_PUT: MARQUEUR_CORS_PUT,
      CURL_MARQUEUR_DRY_RUN: MARQUEUR_DRY_RUN,
      CURL_MARQUEUR_APPELS_CACHE: MARQUEUR_APPELS_CACHE,
      CURL_CORPS_GET: CORPS_GET,
      CURL_CACHE_AVANT: CACHE_AVANT,
      CURL_CACHE_APRES: CACHE_APRES,
      CURL_CORS_AVANT: CORS_AVANT,
      CURL_CORS_APRES: CORS_APRES,
      CURL_CACHE_CODE: leTour.codeCache ?? "200",
      ...(leTour.echecLecture ? { CURL_ECHEC_LECTURE: "1" } : {}),
      ...(leTour.echecLectureCache ? { CURL_ECHEC_LECTURE_CACHE: "1" } : {}),
      ...(leTour.echecLectureCors ? { CURL_ECHEC_LECTURE_CORS: "1" } : {}),
      ...(leTour.dryRunRefusee ? { CURL_DRY_RUN_REFUSEE: "1" } : {}),
    },
  })

  const lire = (chemin: string): string =>
    existsSync(chemin) ? readFileSync(chemin, "utf8") : ""

  return {
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
    statut: execution.status,
    putEffectue: existsSync(MARQUEUR_PUT),
    dryRunEffectue: existsSync(MARQUEUR_DRY_RUN),
    cachePutEffectue: existsSync(MARQUEUR_CACHE_PUT),
    corsPutEffectue: existsSync(MARQUEUR_CORS_PUT),
    corpsDryRun: lire(MARQUEUR_DRY_RUN),
    corpsCachePut: lire(MARQUEUR_CACHE_PUT),
    corpsCorsPut: lire(MARQUEUR_CORS_PUT),
    appelsCache: lire(MARQUEUR_APPELS_CACHE),
  }
}

function occurrences(texte: string, motif: string): number {
  return texte.split(motif).length - 1
}

afterAll(() => {
  rmSync(DOSSIER, { force: true, recursive: true })
})

describe("scripts/setup-providers.sh — garde avant le PUT qui remplace l'ensemble des règles R2", () => {
  it("n'applique rien quand la lecture des règles vivantes échoue", () => {
    const { sortie, statut, putEffectue } = lancer({
      reponses: [...ENTETE, "jeton-r2", "compte-r2", "y"],
      echecLecture: true,
    })

    expect(statut).toBe(0)
    expect(putEffectue).toBe(false)
    expect(sortie).toContain("could not read the live rules")
    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION_R2)).toBe(0)
  })

  it("n'applique rien quand l'API répond une enveloppe d'erreur en HTTP 200", () => {
    const { sortie, putEffectue } = lancer({
      reponses: [...ENTETE, "jeton-r2", "compte-r2", "y"],
      corpsGet: JSON.stringify({
        success: false,
        errors: [{ code: "10000", message: "Invalid access token" }],
      }),
    })

    expect(putEffectue).toBe(false)
    expect(sortie).toContain("could not read the live rules")
  })

  it("demande la seconde confirmation quand des règles étrangères vont être supprimées", () => {
    const reglesEtrangeres = [
      ...REGLES_R2,
      {
        id: "regle-d-autre-equipe",
        enabled: true,
        prefix: "thumbnails/",
        expire: { days: 30 },
      },
    ]
    const { sortie, putEffectue } = lancer({
      reponses: [...ENTETE, "jeton-r2", "compte-r2", "y", "n"],
      corpsGet: JSON.stringify({ result: { rules: reglesEtrangeres } }),
    })

    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION_R2)).toBe(1)
    expect(sortie).toContain("regle-d-autre-equipe")
    expect(putEffectue).toBe(false)
    expect(sortie).toContain("would delete existing bucket rules")
  })

  it("applique sans seconde confirmation quand aucune règle étrangère n'est menacée", () => {
    const { sortie, putEffectue } = lancer({
      reponses: [...ENTETE, "jeton-r2", "compte-r2", "y", ""],
      corpsGet: REGLES_R2_VIVANTES,
    })

    expect(putEffectue).toBe(true)
    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION_R2)).toBe(0)
    expect(sortie).toContain("live rules match the artifact")
  })
})

describe("scripts/setup-providers.sh — politique CORS R2 de l'Administration", () => {
  const AVANT_CORS = [...ENTETE, "jeton-r2", "compte-r2", "y", "", "y"]

  it("applique le corps de l'artefact puis vérifie la politique vivante", () => {
    const { sortie, corsPutEffectue, corpsCorsPut } = lancer({
      reponses: [...AVANT_CORS, ""],
      corsAvant: { success: true, result: { rules: REGLES_CORS } },
      corsApres: { success: true, result: { rules: REGLES_CORS } },
    })

    expect(corsPutEffectue).toBe(true)
    expect(corpsCorsPut).toBe(CORPS_CORS)
    expect(sortie).toContain("live CORS rules match the artifact")
  })

  it("n'applique rien quand la lecture de la politique CORS échoue", () => {
    const { sortie, corsPutEffectue } = lancer({
      reponses: AVANT_CORS,
      echecLectureCors: true,
    })

    expect(corsPutEffectue).toBe(false)
    expect(sortie).toContain("could not read the live CORS rules")
  })

  it("liste une règle étrangère et n'écrit rien sans seconde confirmation", () => {
    const etrangere = {
      id: "cors-d-autre-equipe",
      allowed: {
        origins: ["https://ailleurs.example"],
        methods: ["GET"],
        headers: [],
      },
      exposeHeaders: [],
      maxAgeSeconds: 60,
    }
    const { sortie, corsPutEffectue } = lancer({
      reponses: [...AVANT_CORS, "n"],
      corsAvant: {
        success: true,
        result: { rules: [...REGLES_CORS, etrangere] },
      },
    })

    expect(corsPutEffectue).toBe(false)
    expect(sortie).toContain("cors-d-autre-equipe")
    expect(sortie).toContain("would delete existing bucket rules")
    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION_CORS)).toBe(1)
  })

  it("applique après la seconde confirmation explicite", () => {
    const etrangere = {
      id: "cors-d-autre-equipe",
      allowed: {
        origins: ["https://ailleurs.example"],
        methods: ["GET"],
        headers: [],
      },
      exposeHeaders: [],
      maxAgeSeconds: 60,
    }
    const { sortie, corsPutEffectue } = lancer({
      reponses: [...AVANT_CORS, "y", ""],
      corsAvant: {
        success: true,
        result: { rules: [...REGLES_CORS, etrangere] },
      },
      corsApres: { success: true, result: { rules: REGLES_CORS } },
    })

    expect(corsPutEffectue).toBe(true)
    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION_CORS)).toBe(1)
    expect(sortie).toContain("live CORS rules match the artifact")
  })
})

describe("scripts/setup-providers.sh — Cache Rules de la zone edge", () => {
  it("refuse sans identifiant de zone, avant tout appel à la zone", () => {
    const { sortie, appelsCache } = lancer({
      reponses: [...AVANT_CACHE, ""],
      corpsGet: REGLES_R2_VIVANTES,
    })

    expect(appelsCache).toBe("")
    expect(sortie).toContain(
      "no CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID — nothing was sent to the zone"
    )
  })

  it("refuse sans jeton, avant tout appel à la zone", () => {
    const { sortie, appelsCache } = lancer({
      reponses: [...ENTETE, "", "compte-r2", "", "zone-123"],
      corpsGet: REGLES_R2_VIVANTES,
    })

    expect(appelsCache).toBe("")
    expect(sortie).toContain(
      "no CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID — nothing was sent to the zone"
    )
  })

  it("n'applique rien quand la lecture des règles de cache échoue", () => {
    const { sortie, dryRunEffectue, cachePutEffectue } = lancer({
      reponses: [...AVANT_CACHE, "zone-123", "y"],
      corpsGet: REGLES_R2_VIVANTES,
      echecLectureCache: true,
    })

    expect(dryRunEffectue).toBe(false)
    expect(cachePutEffectue).toBe(false)
    expect(sortie).toContain("could not read the live cache rules")
  })

  it("valide avec dry_run, écrit le corps de l'artefact et vérifie une projection qui ignore id, version et last_updated", () => {
    const cacheAvant = {
      result: {
        id: "ruleset-1",
        version: "1",
        last_updated: "2026-10-23T10:00:00Z",
        rules: REGLES_CACHE,
      },
    }
    const cacheApres = {
      result: {
        id: "ruleset-1",
        version: "2",
        last_updated: "2026-10-23T10:01:00Z",
        rules: REGLES_CACHE,
      },
    }
    const {
      sortie,
      dryRunEffectue,
      cachePutEffectue,
      corpsDryRun,
      corpsCachePut,
    } = lancer({
      reponses: [...AVANT_CACHE, "zone-123", "y"],
      corpsGet: REGLES_R2_VIVANTES,
      cacheAvant,
      cacheApres,
    })

    expect(dryRunEffectue).toBe(true)
    expect(cachePutEffectue).toBe(true)
    expect(corpsDryRun).toBe(CORPS_CACHE)
    expect(corpsCachePut).toBe(CORPS_CACHE)
    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION_CACHE)).toBe(0)
    expect(sortie).toContain("live cache rules match the artifact")
    expect(sortie).toContain("rulesets/ruleset-1")
    expect(sortie).toContain("DELETE")
    expect(sortie).toContain('{"rules":[]}')
  })

  it("traite une phase sans ruleset comme vide, l'applique et imprime le revert", () => {
    const cacheApres = {
      result: {
        id: "ruleset-cree",
        version: "1",
        last_updated: "2026-10-23T10:01:00Z",
        rules: REGLES_CACHE,
      },
    }
    const { sortie, dryRunEffectue, cachePutEffectue } = lancer({
      reponses: [...AVANT_CACHE, "zone-123", "y"],
      corpsGet: REGLES_R2_VIVANTES,
      codeCache: "404",
      cacheApres,
    })

    expect(dryRunEffectue).toBe(true)
    expect(cachePutEffectue).toBe(true)
    expect(sortie).toContain("live cache rules match the artifact")
    expect(sortie).toContain("rulesets/ruleset-cree")
  })

  it("affiche les règles étrangères et n'écrit rien quand la seconde confirmation est refusée", () => {
    const etrangere = {
      ref: "regle-d-autre-equipe",
      description: "une autre équipe",
      enabled: true,
      expression: '(http.host eq "autre.example")',
      action: "set_cache_settings",
      action_parameters: { cache: false },
    }
    const { sortie, dryRunEffectue, cachePutEffectue } = lancer({
      reponses: [...AVANT_CACHE, "zone-123", "y", "n"],
      corpsGet: REGLES_R2_VIVANTES,
      cacheAvant: {
        result: { id: "ruleset-1", rules: [...REGLES_CACHE, etrangere] },
      },
    })

    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION_CACHE)).toBe(1)
    expect(sortie).toContain("regle-d-autre-equipe")
    expect(sortie).toContain("would delete existing phase rules")
    expect(dryRunEffectue).toBe(false)
    expect(cachePutEffectue).toBe(false)
  })

  it("applique après la seconde confirmation explicite", () => {
    const etrangere = {
      ref: "regle-d-autre-equipe",
      description: "une autre équipe",
      enabled: true,
      expression: '(http.host eq "autre.example")',
      action: "set_cache_settings",
      action_parameters: { cache: false },
    }
    const cacheApres = {
      result: { id: "ruleset-1", version: "2", rules: REGLES_CACHE },
    }
    const { sortie, dryRunEffectue, cachePutEffectue } = lancer({
      reponses: [...AVANT_CACHE, "zone-123", "y", "y"],
      corpsGet: REGLES_R2_VIVANTES,
      cacheAvant: {
        result: { id: "ruleset-1", rules: [...REGLES_CACHE, etrangere] },
      },
      cacheApres,
    })

    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION_CACHE)).toBe(1)
    expect(dryRunEffectue).toBe(true)
    expect(cachePutEffectue).toBe(true)
    expect(sortie).toContain("live cache rules match the artifact")
  })

  it("s'arrête quand le dry_run refuse l'expression, sans écrire", () => {
    const { sortie, dryRunEffectue, cachePutEffectue } = lancer({
      reponses: [...AVANT_CACHE, "zone-123", "y"],
      corpsGet: REGLES_R2_VIVANTES,
      dryRunRefusee: true,
    })

    expect(dryRunEffectue).toBe(true)
    expect(cachePutEffectue).toBe(false)
    expect(sortie).toContain("expression failed to parse")
    expect(sortie).toContain(
      "the API rejected the ruleset — nothing was written"
    )
  })

  it("signale une relecture qui ne correspond plus à l'artefact", () => {
    const cacheApres = {
      result: {
        id: "ruleset-1",
        version: "2",
        rules: [
          {
            ...(REGLES_CACHE[0] as Record<string, unknown>),
            expression: '(http.host eq "eguidar.com")',
          },
        ],
      },
    }
    const { sortie, cachePutEffectue } = lancer({
      reponses: [...AVANT_CACHE, "zone-123", "y"],
      corpsGet: REGLES_R2_VIVANTES,
      cacheApres,
    })

    expect(cachePutEffectue).toBe(true)
    expect(sortie).toContain("live cache rules differ from the artifact")
  })
})
