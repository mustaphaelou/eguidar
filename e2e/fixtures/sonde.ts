import "dotenv/config"

import { test as base, expect } from "@playwright/test"

import { resoudreBaseDeSonde } from "../harnais/base-de-sonde"
import { demarrerLeServeur, type ServeurDeSonde } from "../harnais/serveur"

/**
 * La couture de la sonde : un serveur par worker, démarré sur l'artefact
 * construit et sur la base dédiée. Il n'y a qu'un worker, donc un seul
 * démarrage par exécution ; un serveur qui ne démarre pas fait échouer le
 * test, il ne le saute jamais.
 */
export const test = base.extend<
  Record<never, never>,
  { serveur: ServeurDeSonde }
>({
  serveur: [
    async ({}, use) => {
      const serveur = await demarrerLeServeur({
        baseDeDonnees: resoudreBaseDeSonde(),
      })
      await use(serveur)
      await serveur.arreter()
    },
    { scope: "worker" },
  ],
})

export { expect }
