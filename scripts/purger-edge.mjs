#!/usr/bin/env node
// Purge la zone Cloudflare entière avant que le nouveau conteneur ne prenne le
// trafic. Volontairement en JavaScript nu, sans build ni dépendance : le service
// one-shot `purge-edge` de docker-compose.yml l'exécute sur la cible `migrate`
// de l'image, où seuls Node 22 et le contexte copié existent.
//
// Le pendant TypeScript de cet appel vit dans `lib/purge-edge-cloudflare.ts`,
// pour les écritures d'administration. Ici, la répétition est assumée : ce
// fichier ne peut importer ni TypeScript ni alias `@/`, et un déploiement ne
// dépend pas d'un outil de build.
//
// Contrat de sortie :
//   - sans CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN : no-op journalisé, code 0 ;
//   - PURGE_EDGE=off : no-op journalisé, code 0 ;
//   - purge acceptée : code 0 ;
//   - tout échec (transport, HTTP, success:false) : code 1, et le service
//     `purge-edge` échoue : l'application ne démarre pas. C'est le but — mieux
//     vaut un déploiement retenu qu'un document pointant vers des chunks morts.

import { pathToFileURL } from "node:url"

const URL_API = "https://api.cloudflare.com/client/v4/zones"

const DELAI_PURGE_MS = 10_000

const VALEURS_DESACTIVEES = new Set(["off", "false", "0", "non", "no"])

const PREFIXE = "[purge-edge]"

function valeur(env, nom) {
  return (env[nom] ?? "").trim()
}

export function purgeDesactivee(env = process.env) {
  return VALEURS_DESACTIVEES.has(valeur(env, "PURGE_EDGE").toLowerCase())
}

export function configurationPurge(env = process.env) {
  const zoneId = valeur(env, "CLOUDFLARE_ZONE_ID")
  const jeton = valeur(env, "CLOUDFLARE_API_TOKEN")
  if (zoneId === "" || jeton === "") return null
  return { zoneId, jeton }
}

function messageDesErreurs(charge) {
  for (const erreur of charge?.errors ?? []) {
    if (typeof erreur?.message === "string" && erreur.message !== "") {
      return erreur.message
    }
  }
  return "réponse Cloudflare en échec"
}

async function echecDeLaReponse(reponse) {
  if (!reponse.ok) {
    let message = ""
    try {
      const charge = await reponse.json()
      message = messageDesErreurs(charge)
    } catch {
      message = ""
    }
    return `HTTP ${reponse.status}${message === "" ? "" : ` — ${message}`}`
  }

  let charge
  try {
    charge = await reponse.json()
  } catch {
    return "réponse Cloudflare illisible"
  }
  if (charge?.success === false) return messageDesErreurs(charge)
  return null
}

export async function purgerToutLEdge(options = {}) {
  const env = options.env ?? process.env
  const envoyer = options.fetch ?? globalThis.fetch
  const journal = options.log ?? console

  if (purgeDesactivee(env)) {
    journal.log(`${PREFIXE} purge ignorée : PURGE_EDGE=${valeur(env, "PURGE_EDGE")}.`)
    return { statut: "ignoree" }
  }

  const configuration = configurationPurge(env)
  if (configuration === null) {
    journal.log(
      `${PREFIXE} purge ignorée : CLOUDFLARE_ZONE_ID et CLOUDFLARE_API_TOKEN ne sont pas tous deux renseignés.`
    )
    return { statut: "ignoree" }
  }

  const url = `${URL_API}/${encodeURIComponent(configuration.zoneId)}/purge_cache`
  let reponse
  try {
    reponse = await envoyer(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.jeton}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ purge_everything: true }),
      signal: AbortSignal.timeout(DELAI_PURGE_MS),
    })
  } catch (erreur) {
    const cause =
      erreur instanceof Error && erreur.message !== ""
        ? erreur.message
        : "transport Cloudflare indisponible"
    throw new Error(`${PREFIXE} ${cause}`)
  }

  const echec = await echecDeLaReponse(reponse)
  if (echec !== null) {
    throw new Error(`${PREFIXE} ${echec}`)
  }

  journal.log(
    `${PREFIXE} zone ${configuration.zoneId} purgée (purge_everything).`
  )
  return { statut: "purgee" }
}

function estExecuteDirectement() {
  const entree = process.argv[1]
  if (entree === undefined) return false
  return pathToFileURL(entree).href === import.meta.url
}

if (estExecuteDirectement()) {
  try {
    await purgerToutLEdge()
  } catch (erreur) {
    console.error(`ECHEC : ${erreur instanceof Error ? erreur.message : erreur}`)
    process.exitCode = 1
  }
}
