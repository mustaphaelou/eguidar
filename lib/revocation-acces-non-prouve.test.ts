import { describe, expect, it } from "vitest"

import {
  revoquerAccesNonProuve,
  type CompteLie,
  type PortAccesCompteClient,
} from "@/lib/revocation-acces-non-prouve"

/**
 * Double en mémoire du port d'accès du Compte client.
 *
 * Expose l'état observable (comptes liés restants, sessions restantes) pour
 * asserter le comportement externe uniquement : aucun comptage d'appels,
 * aucun détail d'implémentation.
 */
interface EtatCompteClient {
  emailVerified: boolean
  comptesLies: CompteLie[]
  sessions: string[]
}

function creerAccesMemoire(initial: Record<string, EtatCompteClient>) {
  const etat = new Map<string, EtatCompteClient>(
    Object.entries(initial).map(([id, compte]) => [
      id,
      {
        emailVerified: compte.emailVerified,
        comptesLies: compte.comptesLies.map((c) => ({ ...c })),
        sessions: [...compte.sessions],
      },
    ])
  )

  const acces: PortAccesCompteClient = {
    async trouverCompteClientParId(id) {
      const compte = etat.get(id)
      if (!compte) return null
      return { id, emailVerified: compte.emailVerified }
    },

    async listerComptesLies(userId) {
      const compte = etat.get(userId)
      if (!compte) return []
      return compte.comptesLies.map((c) => ({ ...c }))
    },

    async supprimerCompteLie(id) {
      for (const compte of etat.values()) {
        const index = compte.comptesLies.findIndex((c) => c.id === id)
        if (index !== -1) compte.comptesLies.splice(index, 1)
      }
    },

    async supprimerSessionsDuCompte(userId) {
      etat.get(userId)?.sessions.splice(0)
    },
  }

  return {
    acces,
    comptesLiesRestants(userId: string) {
      return etat.get(userId)?.comptesLies.map((c) => ({ ...c })) ?? []
    },
    sessionsRestantes(userId: string) {
      return [...(etat.get(userId)?.sessions ?? [])]
    },
    marquerVerifie(userId: string) {
      const compte = etat.get(userId)
      if (compte) compte.emailVerified = true
    },
  }
}

const COMPTE_NON_VERIFIE: EtatCompteClient = {
  emailVerified: false,
  comptesLies: [
    { id: "compte-mot-de-passe-1", providerId: "credential" },
    { id: "compte-mot-de-passe-2", providerId: "credential" },
    { id: "compte-google", providerId: "google" },
    { id: "compte-facebook", providerId: "facebook" },
  ],
  sessions: ["session-avant-preuve-1", "session-avant-preuve-2"],
}

describe("Vérification de l'e-mail : révocation de l'accès non prouvé", () => {
  it("la promotion d'un Compte client non vérifié supprime exactement ses comptes credential et toutes ses sessions", async () => {
    const memoire = creerAccesMemoire({
      "compte-client-attaque": { ...COMPTE_NON_VERIFIE },
      "compte-client-voisin": {
        emailVerified: false,
        comptesLies: [{ id: "voisin-mot-de-passe", providerId: "credential" }],
        sessions: ["session-voisin"],
      },
    })

    await revoquerAccesNonProuve(memoire.acces, "compte-client-attaque", {
      emailVerified: true,
    })

    expect(
      memoire
        .comptesLiesRestants("compte-client-attaque")
        .map((c) => c.providerId)
        .sort()
    ).toEqual(["facebook", "google"])
    expect(memoire.sessionsRestantes("compte-client-attaque")).toEqual([])

    expect(memoire.comptesLiesRestants("compte-client-voisin")).toEqual([
      { id: "voisin-mot-de-passe", providerId: "credential" },
    ])
    expect(memoire.sessionsRestantes("compte-client-voisin")).toEqual([
      "session-voisin",
    ])
  })

  it("un Compte client déjà vérifié est un no-op strict", async () => {
    const memoire = creerAccesMemoire({
      "compte-client-verifie": {
        emailVerified: true,
        comptesLies: [
          { id: "mot-de-passe-apres-preuve", providerId: "credential" },
          { id: "lien-google", providerId: "google" },
        ],
        sessions: ["session-apres-preuve"],
      },
    })

    await revoquerAccesNonProuve(memoire.acces, "compte-client-verifie", {
      emailVerified: true,
    })

    expect(memoire.comptesLiesRestants("compte-client-verifie")).toEqual([
      { id: "mot-de-passe-apres-preuve", providerId: "credential" },
      { id: "lien-google", providerId: "google" },
    ])
    expect(memoire.sessionsRestantes("compte-client-verifie")).toEqual([
      "session-apres-preuve",
    ])
  })

  it("une mise à jour qui ne pose pas le drapeau vérifié ne change rien", async () => {
    for (const miseAJour of [
      {},
      { emailVerified: false },
      { emailVerified: null },
    ]) {
      const memoire = creerAccesMemoire({
        "compte-client": { ...COMPTE_NON_VERIFIE },
      })

      await revoquerAccesNonProuve(memoire.acces, "compte-client", miseAJour)

      expect(
        memoire
          .comptesLiesRestants("compte-client")
          .map((c) => c.id)
          .sort()
      ).toEqual(
        [
          "compte-facebook",
          "compte-google",
          "compte-mot-de-passe-1",
          "compte-mot-de-passe-2",
        ].sort()
      )
      expect(memoire.sessionsRestantes("compte-client")).toEqual([
        "session-avant-preuve-1",
        "session-avant-preuve-2",
      ])
    }
  })

  it("la double promotion converge sans erreur", async () => {
    const memoire = creerAccesMemoire({
      "compte-client": { ...COMPTE_NON_VERIFIE },
    })

    await revoquerAccesNonProuve(memoire.acces, "compte-client", {
      emailVerified: true,
    })
    await expect(
      revoquerAccesNonProuve(memoire.acces, "compte-client", {
        emailVerified: true,
      })
    ).resolves.toBeUndefined()

    memoire.marquerVerifie("compte-client")
    await expect(
      revoquerAccesNonProuve(memoire.acces, "compte-client", {
        emailVerified: true,
      })
    ).resolves.toBeUndefined()

    expect(
      memoire
        .comptesLiesRestants("compte-client")
        .map((c) => c.providerId)
        .sort()
    ).toEqual(["facebook", "google"])
    expect(memoire.sessionsRestantes("compte-client")).toEqual([])
  })

  it("un Compte client inconnu est un no-op", async () => {
    const memoire = creerAccesMemoire({})

    await expect(
      revoquerAccesNonProuve(memoire.acces, "compte-inexistant", {
        emailVerified: true,
      })
    ).resolves.toBeUndefined()
  })
})
