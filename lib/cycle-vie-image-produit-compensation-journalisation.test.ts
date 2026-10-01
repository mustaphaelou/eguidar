import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  brouillon,
  creerCycleVieTest,
} from "@/test/cycle-vie-image-produit-memoire"

const DATE_INITIALE = new Date("2026-06-02T10:00:00.000Z")

const ERREUR_CATALOGUE = "Ce slug est déjà pris par un autre Produit"

/**
 * La compensation court sur un chemin d'échec : elle rend ce qu'une
 * revendication avait pris quand l'enregistrement du Catalogue a échoué. Elle ne
 * peut donc pas devenir un refus — le refus qui part vers l'éditeur est celui du
 * Catalogue, et le masquer derrière une compensation ratée effacerait la seule
 * cause qu'il reste à lire.
 *
 * Ce qu'elle peut faire, en revanche, c'est échouer elle-même : le registre est
 * hors service au moment exact du rattrapage. Alors elle est journalisée, comme
 * le fait déjà le registre durable quand l'écriture de l'état `expiré` échoue.
 */
describe("journalisation d'une compensation qui échoue", () => {
  // Le journal est intercepté pour toute la suite, pas seulement pour le cas qui
  // l'affirme : un `console.warn` non intercepté polluerait la sortie des cas
  // voisins, et les rendrait bavards sans rien prouver de plus.
  let journal: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    journal = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function echouerAEnregistrer() {
    const environnement = creerCycleVieTest(DATE_INITIALE)
    const demande = await environnement.cycleVie.demanderBrouillon({
      ownerId: "editeur-1",
      contentType: "image/png",
      size: 1024,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")
    return { ...environnement, demande }
  }

  function enregistrerQuiEchoue() {
    return async () => {
      throw new UserFacingError(ERREUR_CATALOGUE)
    }
  }

  it("laisse le refus du Catalogue atteindre l'éditeur, jamais celui de la compensation", async () => {
    const { cycleVie, registre, demande } = await echouerAEnregistrer()
    registre.pannes.add("annulerRevendication")

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: enregistrerQuiEchoue(),
    })

    // La cause reste celle du Catalogue : une compensation ratée ne devient pas
    // le refus, ni ne s'y substitue.
    expect(resultat).toEqual({
      ok: false,
      code: "catalogue-refuse",
      message: ERREUR_CATALOGUE,
    })
  })

  it("journalise le Brouillon qu'elle n'a pas pu rendre à l'éditeur", async () => {
    const { cycleVie, registre, demande } = await echouerAEnregistrer()
    registre.pannes.add("annulerRevendication")

    await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: enregistrerQuiEchoue(),
    })

    // Le même préfixe et la même forme que le journal best-effort du registre
    // durable, qui porte l'échec d'écriture de l'état `expiré` : un message, et
    // la cause en second argument.
    expect(journal).toHaveBeenCalledTimes(1)
    const [message, cause] = journal.mock.calls[0]
    expect(message).toBe(
      `[brouillon-image-produit] compensation non écrite pour ${demande.draftId}`
    )
    expect(cause).toBeInstanceOf(Error)
    // Ce qui est journalisé, c'est l'échec de la compensation — jamais la cause
    // du refus, qui part déjà vers l'éditeur par un autre chemin.
    expect(journal).not.toHaveBeenCalledWith(
      expect.anything(),
      ERREUR_CATALOGUE
    )
  })

  it("laisse le Brouillon revendiqué quand la compensation a échoué", async () => {
    const { cycleVie, registre, demande } = await echouerAEnregistrer()
    registre.pannes.add("annulerRevendication")

    await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-1",
      ownerId: "editeur-1",
      galerie: [brouillon(demande.draftId)],
      enregistrer: enregistrerQuiEchoue(),
    })

    // Rien n'a été rendu à l'éditeur, donc rien n'est prétendu : la ligne reste
    // ce que la revendication en avait fait. La copie promue, elle, a bien été
    // nettoyée — c'est l'autre moitié de la compensation, et elle a réussi.
    expect(registre.records.get(demande.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-1",
      productId: null,
    })
  })
})
