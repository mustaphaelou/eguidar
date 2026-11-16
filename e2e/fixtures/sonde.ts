import "dotenv/config"

import { test as base, expect } from "@playwright/test"

import { resoudreBaseDeSonde } from "../harnais/base-de-sonde"
import {
  afficherRedis,
  resoudreRedisDeSonde,
  viderLaBaseRedis,
} from "../harnais/redis-de-sonde"
import { demarrerLeServeur, type ServeurDeSonde } from "../harnais/serveur"

export const test = base.extend<
  Record<never, never>,
  { serveur: ServeurDeSonde }
>({
  serveur: [
    async ({}, use) => {
      const redis = resoudreRedisDeSonde()
      if (redis === null) {
        console.log("[sonde] aucun Redis déclaré : la sonde tourne sans cache")
      } else {
        await viderLaBaseRedis(redis)
        console.log(`[sonde] cache applicatif vidé : ${afficherRedis(redis)}`)
      }
      const serveur = await demarrerLeServeur({
        baseDeDonnees: resoudreBaseDeSonde(),
        redisUrl: redis,
      })
      await use(serveur)
      await serveur.arreter()
    },
    { scope: "worker" },
  ],
})

export { expect }
