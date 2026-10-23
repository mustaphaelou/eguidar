import { expect } from "vitest"

import type {
  CodeEchecPurge,
  DemandePurge,
  PortPurgeEdge,
  ResultatPurgeEdge,
} from "@/lib/purge-edge"
import {
  demandeDePurge,
  HOME_TAG,
  PRODUCT_TAG,
  productDetailTag,
  tagsCatalogue,
  tagsStructure,
  type CatalogueEventProduct,
} from "@/lib/use-cases/cache-invalidation"

const BASE = "https://eguidar.com"

export type EtatPurge = "sain" | "non-configure" | "mort"

export interface ContextePurge {
  readonly limiteUrlsParAppel: number
}

export interface AdaptateurPurge {
  (
    etat: EtatPurge,
    contexte: ContextePurge
  ): {
    port: PortPurgeEdge
    lots(): readonly DemandePurge[]
  }
}

export type ResultatObserve =
  { ok: true } | { ok: false; code: CodeEchecPurge } | { leve: true }

export interface ObservationPurge {
  readonly resultat: ResultatObserve
  readonly urls: readonly string[]
  readonly tout: boolean
  readonly lots: number
  readonly plusGrandLot: number
}

export interface ScenarioPurge {
  readonly nom: string
  readonly etat?: EtatPurge
  readonly limiteUrlsParAppel?: number
  readonly interditLaLevee?: true
  readonly attendu: ObservationPurge
  jouer(port: PortPurgeEdge): Promise<ResultatPurgeEdge>
}

const EVENEMENT_RENOMME: CatalogueEventProduct = {
  id: "produit-1",
  slug: "nouveau-slug",
  previousSlug: "ancien-slug",
  categoryChain: [{ slug: "racine" }, { slug: "telephones" }],
}

function urlsTriees(urls: readonly string[]): string[] {
  return [...new Set(urls)].sort()
}

function observation(
  resultat: ResultatPurgeEdge,
  lots: readonly DemandePurge[]
): ObservationPurge {
  const urls = urlsTriees(
    lots.flatMap((lot) => (lot.kind === "urls" ? lot.urls : []))
  )
  return {
    resultat: resultat.ok
      ? { ok: true }
      : { ok: false, code: resultat.erreur.code },
    urls,
    tout: lots.some((lot) => lot.kind === "tout"),
    lots: lots.length,
    plusGrandLot: lots.reduce(
      (plusGrand, lot) =>
        lot.kind === "urls" ? Math.max(plusGrand, lot.urls.length) : plusGrand,
      0
    ),
  }
}

function scenarioProduitRenomme(): ScenarioPurge {
  return {
    nom: "un Produit renommé purge son document, l'ancien, ses Structures et l'accueil",
    attendu: {
      resultat: { ok: true },
      urls: urlsTriees([
        `${BASE}/`,
        `${BASE}/categorie/racine`,
        `${BASE}/categorie/telephones`,
        `${BASE}/produit/ancien-slug`,
        `${BASE}/produit/nouveau-slug`,
      ]),
      tout: false,
      lots: 1,
      plusGrandLot: 5,
    },
    async jouer(port) {
      return port.purger(demandeDePurge(tagsCatalogue(EVENEMENT_RENOMME)))
    },
  }
}

const URLS_LONGUES = [
  HOME_TAG,
  ...Array.from({ length: 9 }, (_, index) => productDetailTag(`p-${index}`)),
]

export const SCENARIOS_PURGE: readonly ScenarioPurge[] = [
  scenarioProduitRenomme(),
  {
    nom: "un Produit déplacé purge aussi les Structures qu'il quitte",
    attendu: {
      resultat: { ok: true },
      urls: urlsTriees([
        `${BASE}/`,
        `${BASE}/produit/nouveau-slug`,
        `${BASE}/categorie/racine`,
        `${BASE}/categorie/telephones`,
        `${BASE}/categorie/accessoires`,
      ]),
      tout: false,
      lots: 1,
      plusGrandLot: 5,
    },
    async jouer(port) {
      return port.purger(
        demandeDePurge(
          tagsCatalogue({
            ...EVENEMENT_RENOMME,
            previousSlug: undefined,
            previousCategoryChain: [
              { slug: "racine" },
              { slug: "accessoires" },
            ],
          })
        )
      )
    },
  },
  {
    nom: "une Structure qui change purge tout le catalogue d'un seul appel",
    attendu: {
      resultat: { ok: true },
      urls: [],
      tout: true,
      lots: 1,
      plusGrandLot: 0,
    },
    async jouer(port) {
      return port.purger(demandeDePurge(tagsStructure()))
    },
  },
  {
    nom: "un tag catalogue sans document nommé purge tout le catalogue",
    attendu: {
      resultat: { ok: true },
      urls: [],
      tout: true,
      lots: 1,
      plusGrandLot: 0,
    },
    async jouer(port) {
      return port.purger(demandeDePurge([PRODUCT_TAG]))
    },
  },
  {
    nom: "un catalogue entier reste entier quel que soit le découpage demandé",
    limiteUrlsParAppel: 1,
    attendu: {
      resultat: { ok: true },
      urls: [],
      tout: true,
      lots: 1,
      plusGrandLot: 0,
    },
    async jouer(port) {
      return port.purger(demandeDePurge(tagsStructure()))
    },
  },
  {
    nom: "une longue liste de documents est purgée par lots sous la limite",
    limiteUrlsParAppel: 3,
    attendu: {
      resultat: { ok: true },
      urls: urlsTriees([
        `${BASE}/`,
        ...Array.from(
          { length: 9 },
          (_, index) => `${BASE}/produit/p-${index}`
        ),
      ]),
      tout: false,
      lots: 4,
      plusGrandLot: 3,
    },
    async jouer(port) {
      return port.purger(demandeDePurge([PRODUCT_TAG, ...URLS_LONGUES]))
    },
  },
  {
    nom: "une demande vide ne fait aucun appel",
    attendu: {
      resultat: { ok: true },
      urls: [],
      tout: false,
      lots: 0,
      plusGrandLot: 0,
    },
    async jouer(port) {
      return port.purger({ kind: "urls", urls: [] })
    },
  },
  {
    nom: "sans configuration, la purge répond non-configure sans lever",
    etat: "non-configure",
    interditLaLevee: true,
    attendu: {
      resultat: { ok: false, code: "non-configure" },
      urls: [],
      tout: false,
      lots: 0,
      plusGrandLot: 0,
    },
    async jouer(port) {
      return port.purger(demandeDePurge(tagsCatalogue(EVENEMENT_RENOMME)))
    },
  },
  {
    nom: "une panne du fournisseur se répond, elle ne se lève pas",
    etat: "mort",
    interditLaLevee: true,
    attendu: {
      resultat: { ok: false, code: "erreur-purge" },
      urls: urlsTriees([
        `${BASE}/`,
        `${BASE}/categorie/racine`,
        `${BASE}/categorie/telephones`,
        `${BASE}/produit/ancien-slug`,
        `${BASE}/produit/nouveau-slug`,
      ]),
      tout: false,
      lots: 1,
      plusGrandLot: 5,
    },
    async jouer(port) {
      return port.purger(demandeDePurge(tagsCatalogue(EVENEMENT_RENOMME)))
    },
  },
]

export async function exigerAccordPurge(
  scenario: ScenarioPurge,
  adaptateurs: readonly AdaptateurPurge[],
  contexte: ContextePurge
): Promise<readonly ObservationPurge[]> {
  const observations: ObservationPurge[] = []
  for (const adaptateur of adaptateurs) {
    const { port, lots } = adaptateur(scenario.etat ?? "sain", {
      limiteUrlsParAppel:
        scenario.limiteUrlsParAppel ?? contexte.limiteUrlsParAppel,
    })
    let resultat: ResultatPurgeEdge
    try {
      resultat = await scenario.jouer(port)
    } catch {
      observations.push({
        resultat: { leve: true },
        urls: [],
        tout: false,
        lots: 0,
        plusGrandLot: 0,
      })
      continue
    }
    observations.push(observation(resultat, lots()))
  }

  const [reference, ...autres] = observations
  for (const autre of autres) {
    expect(autre, `${scenario.nom} — accord entre les adaptateurs`).toEqual(
      reference
    )
  }
  expect(reference, `${scenario.nom} — valeur épinglée`).toEqual(
    scenario.attendu
  )
  if (scenario.interditLaLevee) {
    expect(
      observations.filter(({ resultat }) => "leve" in resultat),
      `${scenario.nom} — le port sait répondre, donc aucune opération ne lève`
    ).toEqual([])
  }
  return observations
}
