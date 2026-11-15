import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  PLANCHERS_INSTALLES,
  plancherDePlage,
  respecteLePlancher,
  versionInstallee,
  type PlancherInstalle,
  type SectionDeManifeste,
} from "./plancher-de-correctif"

const RACINE = path.resolve(import.meta.dirname, "..", "..")

type Manifeste = Record<SectionDeManifeste, Record<string, string> | undefined>

const MANIFESTE = JSON.parse(
  readFileSync(path.join(RACINE, "package.json"), "utf8")
) as Manifeste

type OptionsDeVerification = {
  manifeste?: Manifeste
  resoudre?: (paquet: string) => string | null
}

function plageDeclaree(
  ligne: PlancherInstalle,
  manifeste: Manifeste = MANIFESTE
): string {
  return manifeste[ligne.plage.section]?.[ligne.plage.cle ?? ligne.paquet] ?? ""
}

function verifierPlage(
  ligne: PlancherInstalle,
  manifeste: Manifeste = MANIFESTE
): void {
  const plage = plageDeclaree(ligne, manifeste)
  const cle = ligne.plage.cle ?? ligne.paquet
  expect(
    plage,
    `${ligne.paquet} : aucune plage déclarée dans ${ligne.plage.section}.${cle}`
  ).not.toBe("")
  const plancher = plancherDePlage(plage)
  expect(
    respecteLePlancher(plancher, ligne.plancher),
    `${ligne.paquet} : la plage ${plage} déclare le plancher ${plancher}, sous ${ligne.plancher}`
  ).toBe(true)
}

function verifierFamille(
  ligne: PlancherInstalle,
  version: string | null,
  resoudre: (paquet: string) => string | null
): void {
  for (const compagnon of ligne.famille ?? []) {
    const versionCompagnon = resoudre(compagnon)
    expect(
      versionCompagnon,
      `${compagnon} est absent de l'arbre installé, ${ligne.paquet} l'exige`
    ).not.toBeNull()
    expect(
      versionCompagnon,
      `${compagnon} a dérivé de la version de ${ligne.paquet} (${version})`
    ).toBe(version)
  }
}

function verifierLigne(
  ligne: PlancherInstalle,
  {
    manifeste = MANIFESTE,
    resoudre = versionInstallee,
  }: OptionsDeVerification = {}
): void {
  const version = resoudre(ligne.paquet)
  if (version === null) {
    expect(
      ligne.absence,
      `${ligne.paquet} est absent de l'arbre installé (${ligne.raison})`
    ).toBe("passe")
  } else {
    expect(
      respecteLePlancher(version, ligne.plancher),
      `${ligne.paquet} ${version} est sous le plancher ${ligne.plancher} (${ligne.raison})`
    ).toBe(true)
  }
  verifierPlage(ligne, manifeste)
  verifierFamille(ligne, version, resoudre)
}

function ligneDe(paquet: string): PlancherInstalle {
  const ligne = PLANCHERS_INSTALLES.find(
    (candidate) => candidate.paquet === paquet
  )
  if (ligne === undefined) {
    throw new Error(`Aucune ligne de plancher pour ${paquet}`)
  }
  return ligne
}

describe("respecteLePlancher", () => {
  it.each([
    { cas: "le plancher lui-même", version: "2.3.4", attendu: true },
    { cas: "un correctif au-dessus", version: "2.3.5", attendu: true },
    { cas: "une mineure au-dessus", version: "2.4.0", attendu: true },
    { cas: "une majeure au-dessus", version: "3.0.0", attendu: true },
    { cas: "un correctif sous le plancher", version: "2.3.3", attendu: false },
    { cas: "une mineure sous le plancher", version: "2.2.9", attendu: false },
    { cas: "une majeure sous le plancher", version: "1.9.9", attendu: false },
    {
      cas: "une préversion du plancher",
      version: "2.3.4-beta.1",
      attendu: false,
    },
    { cas: "une version vide", version: "", attendu: false },
    { cas: "une version illisible", version: "garbage", attendu: false },
  ])("$cas", ({ version, attendu }) => {
    expect(respecteLePlancher(version, "2.3.4")).toBe(attendu)
  })
})

describe("les planchers des paquets installés", () => {
  for (const ligne of PLANCHERS_INSTALLES) {
    it(`${ligne.paquet} tient le plancher ${ligne.plancher}`, () => {
      verifierLigne(ligne)
    })
  }
})

describe("l'absence d'un paquet installé", () => {
  it.each(["next", "better-auth", "vitest", "@vitest/mocker"])(
    "%s exige sa présence",
    (paquet) => {
      expect(() =>
        verifierLigne(ligneDe(paquet), { resoudre: () => null })
      ).toThrow()
    }
  )

  it.each(["fast-uri", "hono", "ip-address", "mysql2", "systeminformation"])(
    "%s passe quand il est absent",
    (paquet) => {
      expect(() =>
        verifierLigne(ligneDe(paquet), { resoudre: () => null })
      ).not.toThrow()
    }
  )
})

describe("la famille better-auth", () => {
  it("échoue quand un paquet compagnon est absent", () => {
    expect(() =>
      verifierLigne(ligneDe("better-auth"), {
        resoudre: (paquet) => (paquet === "better-auth" ? "1.7.18" : null),
      })
    ).toThrow()
  })

  it("échoue quand un paquet compagnon dérive de la version", () => {
    expect(() =>
      verifierLigne(ligneDe("better-auth"), {
        resoudre: (paquet) => (paquet === "better-auth" ? "1.7.18" : "1.7.17"),
      })
    ).toThrow()
  })
})

describe("une violation synthétique", () => {
  it("fait tomber un plancher relevé au-dessus de la version installée", () => {
    const plancherReleve = "999.999.999"
    expect(versionInstallee("next")).not.toBeNull()
    expect(() =>
      verifierLigne(
        { ...ligneDe("next"), plancher: plancherReleve },
        {
          manifeste: {
            ...MANIFESTE,
            dependencies: {
              ...(MANIFESTE.dependencies ?? {}),
              next: `^${plancherReleve}`,
            },
          },
        }
      )
    ).toThrow()
  })

  it("fait tomber une plage déclarée sous son plancher", () => {
    expect(() =>
      verifierLigne(ligneDe("fast-uri"), {
        manifeste: {
          ...MANIFESTE,
          overrides: { ...(MANIFESTE.overrides ?? {}), "fast-uri": "^3.1.7" },
        },
      })
    ).toThrow()
  })
})
