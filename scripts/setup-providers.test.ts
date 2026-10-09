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

const REGLES_ARTEFACT = (
  JSON.parse(
    readFileSync(path.join(RACINE, "infra", "regle-cycle-vie-r2.json"), "utf8")
  ) as { rules: unknown[] }
).rules

const QUESTION_SECONDE_CONFIRMATION =
  "Delete those rules and leave only the artifact's rule?"

const REPONSES = [
  "",
  "",
  "",
  "site-cle",
  "cle-secrete",
  "jeton-r2",
  "compte-r2",
  "y",
  "n",
  "",
].join("\n")

const DOSSIER = mkdtempSync(path.join(tmpdir(), "setup-providers-"))
const STUBS = path.join(DOSSIER, "bin")
const MARQUEUR_PUT = path.join(DOSSIER, "put-effectue")
const CORPS_GET = path.join(DOSSIER, "reponse-get.json")
const ENV_FILE = path.join(DOSSIER, "env")

mkdirSync(STUBS, { recursive: true })

writeFileSync(
  path.join(STUBS, "curl"),
  `#!/usr/bin/env bash
if [[ " $* " == *" -X PUT "* ]]; then
  printf '%s' "\${!#}" > "$CURL_MARQUEUR_PUT"
  printf '{"success":true,"result":{}}'
  exit 0
fi
if [[ -n "\${CURL_ECHEC_LECTURE:-}" ]]; then
  echo "curl: (7) Failed to connect to api.cloudflare.com port 443" >&2
  exit 7
fi
printf '%s' "$(<"$CURL_CORPS_GET")"
`,
  { mode: 0o755 }
)
for (const ouvreur of ["xdg-open", "open", "wslview", "explorer.exe"]) {
  writeFileSync(path.join(STUBS, ouvreur), "#!/usr/bin/env bash\nexit 0\n", {
    mode: 0o755,
  })
}

function lancer(leTour: { corpsGet?: string; echecLecture?: boolean }): {
  sortie: string
  statut: number | null
  putEffectue: boolean
} {
  if (leTour.corpsGet !== undefined) writeFileSync(CORPS_GET, leTour.corpsGet)
  rmSync(MARQUEUR_PUT, { force: true })

  const execution = spawnSync("bash", [SCRIPT], {
    input: `${REPONSES}\n`,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      PATH: `${STUBS}${path.delimiter}${process.env.PATH ?? ""}`,
      ENV_FILE,
      CURL_MARQUEUR_PUT: MARQUEUR_PUT,
      CURL_CORPS_GET: CORPS_GET,
      ...(leTour.echecLecture ? { CURL_ECHEC_LECTURE: "1" } : {}),
    },
  })

  return {
    sortie: `${execution.stdout ?? ""}${execution.stderr ?? ""}`,
    statut: execution.status,
    putEffectue: existsSync(MARQUEUR_PUT),
  }
}

function occurrences(texte: string, motif: string): number {
  return texte.split(motif).length - 1
}

afterAll(() => {
  rmSync(DOSSIER, { force: true, recursive: true })
})

describe("scripts/setup-providers.sh — garde avant le PUT qui remplace l'ensemble des règles", () => {
  it("n'applique rien quand la lecture des règles vivantes échoue", () => {
    const { sortie, statut, putEffectue } = lancer({ echecLecture: true })

    expect(statut).toBe(0)
    expect(putEffectue).toBe(false)
    expect(sortie).toContain("could not read the live rules")
    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION)).toBe(0)
  })

  it("n'applique rien quand l'API répond une enveloppe d'erreur en HTTP 200", () => {
    const { sortie, putEffectue } = lancer({
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
      ...REGLES_ARTEFACT,
      {
        id: "regle-d-autre-equipe",
        enabled: true,
        prefix: "thumbnails/",
        expire: { days: 30 },
      },
    ]
    const { sortie, putEffectue } = lancer({
      corpsGet: JSON.stringify({ result: { rules: reglesEtrangeres } }),
    })

    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION)).toBe(1)
    expect(sortie).toContain("regle-d-autre-equipe")
    expect(putEffectue).toBe(false)
    expect(sortie).toContain("would delete existing bucket rules")
  })

  it("applique sans seconde confirmation quand aucune règle étrangère n'est menacée", () => {
    const { sortie, putEffectue } = lancer({
      corpsGet: JSON.stringify({ result: { rules: REGLES_ARTEFACT } }),
    })

    expect(putEffectue).toBe(true)
    expect(occurrences(sortie, QUESTION_SECONDE_CONFIRMATION)).toBe(0)
    expect(sortie).toContain("live rules match the artifact")
  })
})
