import { describe, expect, it } from "vitest"

import {
  BUDGET_LIMITEUR_RECHERCHE,
  FENETRE_LIMITEUR_RECHERCHE_MS,
} from "@/lib/limiteur-recherche"
import { creerLimiteurRechercheMemoire } from "@/test/limiteur-recherche-memoire"

describe("Réglages par défaut du limiteur de Recherche", () => {
  it("laisse passer le budget de la constante, puis refuse la requête suivante", async () => {
    const limiteur = creerLimiteurRechercheMemoire()

    const verdicts: string[] = []
    for (let i = 0; i < BUDGET_LIMITEUR_RECHERCHE; i += 1) {
      verdicts.push(await limiteur.consommer("203.0.113.7"))
    }

    expect(verdicts).toEqual(
      Array.from({ length: BUDGET_LIMITEUR_RECHERCHE }, () => "autorise")
    )
    await expect(limiteur.consommer("203.0.113.7")).resolves.toBe("refuse")
  })

  it("rouvre la fenêtre au bout de la constante", async () => {
    let maintenant = 1_000
    const limiteur = creerLimiteurRechercheMemoire({
      maintenant: () => maintenant,
    })

    for (let i = 0; i < BUDGET_LIMITEUR_RECHERCHE; i += 1) {
      await limiteur.consommer("203.0.113.7")
    }
    await expect(limiteur.consommer("203.0.113.7")).resolves.toBe("refuse")

    maintenant += FENETRE_LIMITEUR_RECHERCHE_MS - 1
    await expect(limiteur.consommer("203.0.113.7")).resolves.toBe("refuse")

    maintenant += 1
    await expect(limiteur.consommer("203.0.113.7")).resolves.toBe("autorise")
  })
})
