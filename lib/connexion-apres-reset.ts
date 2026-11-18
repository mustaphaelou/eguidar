import { createAuthMiddleware, isAPIError } from "better-auth/api"
import type { BetterAuthPlugin } from "better-auth"
import "server-only"

import { prisma } from "@/lib/db"
import {
  motDePasseDoitEtreRehache,
  verifierMotDePasse,
} from "@/lib/mot-de-passe-hache"

const CHEMIN_CONNEXION_MOT_DE_PASSE = "/sign-in/email"

interface EmpreinteConnexion {
  debut: number
  adresse: string
  version: string | null
}

const empreintes = new WeakMap<object, EmpreinteConnexion>()

function adresseDuCorps(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const email = (body as { email?: unknown }).email
  return typeof email === "string" && email.trim() !== ""
    ? email.toLowerCase()
    : null
}

async function lireIdentifiant(adresse: string) {
  return prisma.account.findFirst({
    where: { providerId: "credential", user: { email: adresse } },
    select: { password: true, updatedAt: true },
  })
}

function motDePasseDuCorps(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const password = (body as { password?: unknown }).password
  return typeof password === "string" ? password : null
}

function jetonRendu(retour: unknown): string | null {
  if (typeof retour !== "object" || retour === null) return null
  const token = (retour as { token?: unknown }).token
  return typeof token === "string" ? token : null
}

const avant = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== CHEMIN_CONNEXION_MOT_DE_PASSE) return
  const adresse = adresseDuCorps(ctx.body)
  if (!adresse) return

  const debut = Date.now()
  const identifiant = await lireIdentifiant(adresse)
  empreintes.set(ctx.context, {
    debut,
    adresse,
    version: identifiant?.password ?? null,
  })
})

const apres = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== CHEMIN_CONNEXION_MOT_DE_PASSE) return
  const empreinte = empreintes.get(ctx.context)
  if (!empreinte) return
  empreintes.delete(ctx.context)
  if (isAPIError(ctx.context.returned)) return

  const jeton = jetonRendu(ctx.context.returned)
  const motDePasse = motDePasseDuCorps(ctx.body)
  if (!jeton || !motDePasse) return

  const identifiant = await lireIdentifiant(empreinte.adresse)
  if (!identifiant) return
  if (identifiant.updatedAt.getTime() < empreinte.debut) return
  if (identifiant.password === empreinte.version) return
  if (
    empreinte.version &&
    motDePasseDoitEtreRehache(empreinte.version) &&
    identifiant.password &&
    (await verifierMotDePasse({
      hash: identifiant.password,
      password: motDePasse,
    }))
  ) {
    return
  }

  await ctx.context.internalAdapter.deleteSession(jeton)
})

export const pluginConnexionApresReset: BetterAuthPlugin = {
  id: "connexion-apres-reset",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === CHEMIN_CONNEXION_MOT_DE_PASSE,
        handler: avant,
      },
    ],
    after: [
      {
        matcher: (ctx) => ctx.path === CHEMIN_CONNEXION_MOT_DE_PASSE,
        handler: apres,
      },
    ],
  },
}
