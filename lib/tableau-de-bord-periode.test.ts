import { describe, expect, it } from "vitest"

import {
  buildTableauDeBordUrl,
  cleDuSeau,
  libelleCourtPeriode,
  libelleDuSeau,
  libelleLongPeriode,
  NOMBRE_DE_SEAUX,
  parsePeriode,
  PERIODE_PAR_DEFAUT,
  seauxDePeriode,
} from "@/lib/tableau-de-bord-periode"

const LUNDI = new Date(2026, 10, 9, 14, 30)
const DIMANCHE = new Date(2026, 10, 15, 9, 0)

describe("parsePeriode", () => {
  it("garde les trois jetons et retombe sur 30 jours pour tout le reste", () => {
    expect(parsePeriode({ periode: "30j" })).toBe("30j")
    expect(parsePeriode({ periode: "90j" })).toBe("90j")
    expect(parsePeriode({ periode: "12mois" })).toBe("12mois")

    for (const brut of [undefined, "", "30", "12", "12-mois", "semaine"]) {
      expect(parsePeriode(brut === undefined ? {} : { periode: brut })).toBe(
        PERIODE_PAR_DEFAUT
      )
    }
  })

  it("tolère un paramètre répété en gardant la première occurrence", () => {
    expect(parsePeriode({ periode: ["90j", "12mois"] })).toBe("90j")
    expect(parsePeriode({ periode: ["bogus", "12mois"] })).toBe(
      PERIODE_PAR_DEFAUT
    )
  })
})

describe("les libellés de la période", () => {
  it("dit la forme courte à l'écran et la forme longue à l'oreille", () => {
    expect(libelleCourtPeriode("30j")).toBe("30 j")
    expect(libelleCourtPeriode("90j")).toBe("90 j")
    expect(libelleCourtPeriode("12mois")).toBe("12 mois")

    expect(libelleLongPeriode("30j")).toBe("30 derniers jours")
    expect(libelleLongPeriode("90j")).toBe("90 derniers jours")
    expect(libelleLongPeriode("12mois")).toBe("12 derniers mois")
  })
})

describe("buildTableauDeBordUrl", () => {
  it("omet la période par défaut", () => {
    expect(buildTableauDeBordUrl()).toBe("/admin")
    expect(buildTableauDeBordUrl({ periode: "30j" })).toBe("/admin")
  })

  it("nomme les deux autres périodes", () => {
    expect(buildTableauDeBordUrl({ periode: "90j" })).toBe("/admin?periode=90j")
    expect(buildTableauDeBordUrl({ periode: "12mois" })).toBe(
      "/admin?periode=12mois"
    )
  })

  it("revient au défaut après un aller-retour par l'URL", () => {
    for (const periode of ["30j", "90j", "12mois"] as const) {
      const url = buildTableauDeBordUrl({ periode })
      const brut = Object.fromEntries(
        new URL(url, "https://eguidar.test").searchParams
      )
      expect(parsePeriode(brut)).toBe(periode)
    }
  })
})

describe("seauxDePeriode", () => {
  it("rend trente jours calendaires, du plus ancien au plus récent", () => {
    const seaux = seauxDePeriode("30j", LUNDI)

    expect(seaux).toHaveLength(NOMBRE_DE_SEAUX["30j"])
    expect(seaux[0]).toMatchObject({
      cle: "2026-10-11",
      debut: new Date(2026, 9, 11),
      fin: new Date(2026, 9, 12),
    })
    expect(seaux.at(-1)).toMatchObject({
      cle: "2026-11-09",
      debut: new Date(2026, 10, 9),
      fin: new Date(2026, 10, 10),
    })

    for (let index = 1; index < seaux.length; index++) {
      expect(seaux[index]!.debut.getTime()).toBe(
        seaux[index - 1]!.fin.getTime()
      )
    }
  })

  it("rend treize semaines, la semaine courante comprise, et part du lundi", () => {
    const seaux = seauxDePeriode("90j", DIMANCHE)

    expect(seaux).toHaveLength(NOMBRE_DE_SEAUX["90j"])
    expect(seaux[0]).toMatchObject({
      cle: "2026-08-17",
      debut: new Date(2026, 7, 17),
    })
    expect(seaux.at(-1)).toMatchObject({
      cle: "2026-11-09",
      debut: new Date(2026, 10, 9),
      fin: new Date(2026, 10, 16),
    })

    for (const seau of seaux) {
      expect(seau.debut.getDay()).toBe(1)
      expect(seau.fin.getDay()).toBe(1)
    }
  })

  it("rend douze mois calendaires, du plus ancien au mois courant", () => {
    const seaux = seauxDePeriode("12mois", LUNDI)

    expect(seaux).toHaveLength(NOMBRE_DE_SEAUX["12mois"])
    expect(seaux[0]).toMatchObject({
      cle: "2025-12",
      debut: new Date(2025, 11, 1),
      fin: new Date(2026, 0, 1),
    })
    expect(seaux.at(-1)).toMatchObject({
      cle: "2026-11",
      debut: new Date(2026, 10, 1),
      fin: new Date(2026, 11, 1),
    })

    for (let index = 1; index < seaux.length; index++) {
      expect(seaux[index]!.debut.getTime()).toBe(
        seaux[index - 1]!.fin.getTime()
      )
    }
  })
})

describe("cleDuSeau", () => {
  it("range un jour dans son jour", () => {
    expect(cleDuSeau("30j", new Date(2026, 10, 9, 23, 59))).toBe("2026-11-09")
  })

  it("range tous les jours d'une semaine sous le lundi qui l'ouvre", () => {
    expect(cleDuSeau("90j", new Date(2026, 10, 9, 0, 0))).toBe("2026-11-09")
    expect(cleDuSeau("90j", new Date(2026, 10, 15, 23, 59))).toBe("2026-11-09")
    expect(cleDuSeau("90j", new Date(2026, 10, 16, 0, 0))).toBe("2026-11-16")
  })

  it("range un jour dans son mois", () => {
    expect(cleDuSeau("12mois", new Date(2026, 10, 9))).toBe("2026-11")
    expect(cleDuSeau("12mois", new Date(2026, 10, 30))).toBe("2026-11")
  })
})

describe("libelleDuSeau", () => {
  it("écrit un jour et une semaine en jj/mm", () => {
    expect(libelleDuSeau("30j", "2026-11-09")).toBe("09/11")
    expect(libelleDuSeau("90j", "2026-08-17")).toBe("17/08")
  })

  it("écrit un mois en abrégé français", () => {
    expect(libelleDuSeau("12mois", "2026-01")).toBe("janv.")
    expect(libelleDuSeau("12mois", "2026-11")).toBe("nov.")
  })
})
