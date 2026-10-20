import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  autoriserRecherche,
  MESSAGE_LIMITEUR_INDISPONIBLE,
} from "@/lib/acces-recherche"
import { LimiteurRechercheIndisponibleError } from "@/lib/limiteur-recherche"
import { creerLimiteurRechercheRedis } from "@/lib/limiteur-recherche-redis"
import { creerLimiteurRechercheMemoire } from "@/test/limiteur-recherche-memoire"

const ENTETES = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })

let avertissement: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  avertissement = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  avertissement.mockRestore()
})

describe("Accès à la Recherche", () => {
  it("transmet au limiteur l'adresse du client lue dans les en-têtes", async () => {
    const consommer = vi.fn().mockResolvedValue("autorise")

    await expect(autoriserRecherche(ENTETES, { consommer })).resolves.toBe(true)
    expect(consommer).toHaveBeenCalledWith("10.0.0.1")
  })

  it("refuse quand le limiteur refuse", async () => {
    const limiteur = creerLimiteurRechercheMemoire({ budget: 1 })
    await autoriserRecherche(ENTETES, limiteur)

    await expect(autoriserRecherche(ENTETES, limiteur)).resolves.toBe(false)
    expect(avertissement).not.toHaveBeenCalled()
  })

  it("laisse passer et journalise quand le limiteur lève", async () => {
    const limiteur = creerLimiteurRechercheMemoire()
    limiteur.pannes.add("consommer")

    await expect(autoriserRecherche(ENTETES, limiteur)).resolves.toBe(true)
    expect(avertissement).toHaveBeenCalledWith(
      MESSAGE_LIMITEUR_INDISPONIBLE,
      expect.any(LimiteurRechercheIndisponibleError)
    )
  })

  it("laisse passer et journalise quand Redis est absent", async () => {
    const limiteur = creerLimiteurRechercheRedis(() => null)

    await expect(autoriserRecherche(ENTETES, limiteur)).resolves.toBe(true)
    expect(avertissement).toHaveBeenCalledWith(
      MESSAGE_LIMITEUR_INDISPONIBLE,
      expect.any(LimiteurRechercheIndisponibleError)
    )
  })
})
