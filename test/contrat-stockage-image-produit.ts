import sharp from "sharp"
import { expect } from "vitest"

import {
  PREFIXE_BROUILLONS_IMAGE_PRODUIT,
  PREFIXE_IMAGES_PRODUIT,
  cleDepuisUrlPublique,
} from "@/lib/espace-de-noms-image-produit"
import {
  CONTENT_TYPES_IMAGE_PRODUIT,
  MAX_UPLOAD_SIZE,
  type CodeEchecStockage,
  type ContentTypeImageProduit,
  type PortStockageImageProduit,
  type ResultatStockageImageProduit,
} from "@/lib/r2"

const TAILLE = 2048

/** Un PNG réel : la vérification décode les octets, elle ne croit aucun type. */
export const IMAGE_CONTRAT = await sharp({
  create: {
    width: 3,
    height: 2,
    channels: 3,
    background: { r: 20, g: 120, b: 220 },
  },
})
  .png()
  .toBuffer()

export const CONTENU_NON_IMAGE = Buffer.from(
  "Ceci n'est pas une image, seulement du texte."
)

export type EtatStockageRejoue = "sain" | "non-configure" | "mort"

export type AdaptateurStockage = (
  etat: EtatStockageRejoue,
  contenu?: Buffer
) => PortStockageImageProduit

export interface IdentiteStockage {
  readonly draftId: string
  readonly contentType: ContentTypeImageProduit
  readonly basePublique: string
  readonly urlImagePersistee: string
  readonly urlImageStructure: string
}

export type ReponseObservee =
  | { ok: true; cle: string | null }
  | { ok: false; code: CodeEchecStockage }
  | { leve: true }

function cleSous(url: string, base: string): string {
  const cle = cleDepuisUrlPublique(url, base)
  if (cle === null) {
    throw new Error(`Adresse publique hors de la base du rejeu : ${url}`)
  }
  return cle
}

async function observer<T>(
  rejouer: () => Promise<ResultatStockageImageProduit<T>>,
  adresse?: (valeur: T) => string | null
): Promise<ReponseObservee> {
  let resultat: ResultatStockageImageProduit<T>
  try {
    resultat = await rejouer()
  } catch {
    return { leve: true }
  }
  if (!resultat.ok) return { ok: false, code: resultat.erreur.code }
  return { ok: true, cle: adresse ? adresse(resultat.valeur) : null }
}

function demandeBrouillon(identite: IdentiteStockage) {
  return { draftId: identite.draftId, contentType: identite.contentType }
}

function demandeEnvoi(identite: IdentiteStockage, taille = TAILLE) {
  return { ...demandeBrouillon(identite), size: taille }
}

function adresseReservee(identite: IdentiteStockage): string {
  return `${identite.basePublique}/${PREFIXE_BROUILLONS_IMAGE_PRODUIT}interdit.webp`
}

async function observerLesSept(
  stockage: PortStockageImageProduit,
  identite: IdentiteStockage
): Promise<Record<keyof PortStockageImageProduit, ReponseObservee>> {
  return {
    presignerBrouillon: await observer(
      () => stockage.presignerBrouillon(demandeEnvoi(identite)),
      (valeur) => cleSous(valeur.previewUrl, identite.basePublique)
    ),
    verifierBrouillon: await observer(
      () => stockage.verifierBrouillon(demandeBrouillon(identite)),
      (valeur) =>
        `${valeur.mimeType}:${valeur.width}x${valeur.height}:${valeur.byteSize}`
    ),
    supprimerBrouillon: await observer(() =>
      stockage.supprimerBrouillon(demandeBrouillon(identite))
    ),
    promouvoirBrouillon: await observer(
      () => stockage.promouvoirBrouillon(demandeBrouillon(identite)),
      (valeur) => cleSous(valeur.publicUrl, identite.basePublique)
    ),
    supprimerImagePromue: await observer(() =>
      stockage.supprimerImagePromue(demandeBrouillon(identite))
    ),
    supprimerImagePersistee: await observer(() =>
      stockage.supprimerImagePersistee(identite.urlImagePersistee)
    ),
    supprimerImageCategorie: await observer(() =>
      stockage.supprimerImageCategorie(identite.urlImageStructure)
    ),
  }
}

export interface ScenarioStockage {
  readonly nom: string
  readonly etat: EtatStockageRejoue
  readonly interditLaLevee?: true
  readonly contenu?: Buffer
  jouer(
    stockage: PortStockageImageProduit,
    identite: IdentiteStockage
  ): Promise<unknown>
}

export const SCENARIOS_STOCKAGE: readonly ScenarioStockage[] = [
  {
    nom: "pré-signifier l'envoi d'un Brouillon et nommer son aperçu",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        apercu: await observer(
          () => stockage.presignerBrouillon(demandeEnvoi(identite)),
          (valeur) => cleSous(valeur.previewUrl, identite.basePublique)
        ),
      }
    },
  },
  {
    nom: "promouvoir un Brouillon vers une Image produit persistée",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        image: await observer(
          () => stockage.promouvoirBrouillon(demandeBrouillon(identite)),
          (valeur) => cleSous(valeur.publicUrl, identite.basePublique)
        ),
      }
    },
  },
  {
    nom: "vérifier un Brouillon téléversé et rendre ses faits réels",
    etat: "sain",
    contenu: IMAGE_CONTRAT,
    async jouer(stockage, identite) {
      return {
        verification: await observer(
          () => stockage.verifierBrouillon(demandeBrouillon(identite)),
          (valeur) =>
            `${valeur.mimeType}:${valeur.width}x${valeur.height}:${valeur.byteSize}`
        ),
      }
    },
  },
  {
    nom: "refuser un Brouillon dont les octets ne décodent pas",
    etat: "sain",
    contenu: CONTENU_NON_IMAGE,
    async jouer(stockage, identite) {
      return {
        verification: await observer(() =>
          stockage.verifierBrouillon(demandeBrouillon(identite))
        ),
      }
    },
  },
  {
    nom: "libérer l'objet d'un Brouillon vivant",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        liberation: await observer(() =>
          stockage.supprimerBrouillon(demandeBrouillon(identite))
        ),
      }
    },
  },
  {
    nom: "retirer la copie promue d'un Brouillon",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        copie: await observer(() =>
          stockage.supprimerImagePromue(demandeBrouillon(identite))
        ),
      }
    },
  },
  {
    nom: "retirer une Image produit déjà persistée",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        image: await observer(() =>
          stockage.supprimerImagePersistee(identite.urlImagePersistee)
        ),
      }
    },
  },
  {
    nom: "retirer une image de Structure hors de l'espace réservé",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        image: await observer(() =>
          stockage.supprimerImageCategorie(identite.urlImageStructure)
        ),
      }
    },
  },
  {
    nom: "refuser une taille qui n'est pas le volume d'une image",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        vide: await observer(() =>
          stockage.presignerBrouillon(demandeEnvoi(identite, 0))
        ),
        auDela: await observer(() =>
          stockage.presignerBrouillon(
            demandeEnvoi(identite, MAX_UPLOAD_SIZE + 1)
          )
        ),
      }
    },
  },
  {
    nom: "refuser un identifiant d'image indéparable",
    etat: "sain",
    async jouer(stockage, identite) {
      const demande = {
        ...demandeBrouillon(identite),
        draftId: `produits/${identite.draftId}`,
      }
      return {
        apercu: await observer(() =>
          stockage.presignerBrouillon({ ...demande, size: TAILLE })
        ),
        liberation: await observer(() => stockage.supprimerBrouillon(demande)),
        verification: await observer(() => stockage.verifierBrouillon(demande)),
        promotion: await observer(() => stockage.promouvoirBrouillon(demande)),
        copie: await observer(() => stockage.supprimerImagePromue(demande)),
      }
    },
  },
  {
    nom: "refuser de viser l'espace réservé aux Brouillons depuis une Image produit",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        image: await observer(() =>
          stockage.supprimerImagePersistee(adresseReservee(identite))
        ),
      }
    },
  },
  {
    nom: "refuser de viser l'espace réservé aux Brouillons depuis une image de Structure",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        image: await observer(() =>
          stockage.supprimerImageCategorie(adresseReservee(identite))
        ),
      }
    },
  },
  {
    nom: "refuser une URL que la base publique du stockage ne nomme pas",
    etat: "sain",
    async jouer(stockage, identite) {
      const ailleurs = identite.urlImagePersistee.replace(
        identite.basePublique,
        "https://ailleurs.example.test"
      )
      return {
        image: await observer(() => stockage.supprimerImagePersistee(ailleurs)),
        structure: await observer(() =>
          stockage.supprimerImageCategorie(ailleurs)
        ),
      }
    },
  },
  {
    nom: "un stockage non configuré répond aux sept opérations qu'on lui demande",
    etat: "non-configure",
    async jouer(stockage, identite) {
      return await observerLesSept(stockage, identite)
    },
  },
  {
    nom: "un stockage mort se répond, il ne se lève pas",
    etat: "mort",
    interditLaLevee: true,
    async jouer(stockage, identite) {
      return await observerLesSept(stockage, identite)
    },
  },
]

export const CODES_ECHEC_CONTRAT: Record<CodeEchecStockage, true> = {
  "non-configure": true,
  "parametre-invalide": true,
  "erreur-stockage": true,
  "contenu-refuse": true,
}

async function rejouer(
  scenario: ScenarioStockage,
  adaptateur: AdaptateurStockage,
  identite: IdentiteStockage
): Promise<unknown> {
  return scenario.jouer(adaptateur(scenario.etat, scenario.contenu), identite)
}

export async function exigerEnteteStockage(
  scenario: ScenarioStockage,
  adaptateurs: readonly AdaptateurStockage[],
  identite: IdentiteStockage
): Promise<readonly unknown[]> {
  const observations: unknown[] = []
  for (const adaptateur of adaptateurs) {
    observations.push(await rejouer(scenario, adaptateur, identite))
  }
  const [reference, ...autres] = observations
  for (const autre of autres) {
    expect(autre, `${scenario.nom} — accord entre les adaptateurs`).toEqual(
      reference
    )
  }
  if (scenario.interditLaLevee) {
    expect(
      observations.flatMap((observation) => levees(observation)),
      `${scenario.nom} — le port sait répondre, donc aucune opération ne lève`
    ).toEqual([])
  }
  return observations
}

export function codesEchec(observation: unknown): string[] {
  const codes: string[] = []
  const visiter = (valeur: unknown): void => {
    if (Array.isArray(valeur)) {
      valeur.forEach(visiter)
      return
    }
    if (!valeur || typeof valeur !== "object") return
    for (const [cle, contenu] of Object.entries(valeur)) {
      if (cle === "code" && typeof contenu === "string") codes.push(contenu)
      else visiter(contenu)
    }
  }
  visiter(observation)
  return codes
}

export function levees(observation: unknown): string[] {
  const trouvees: string[] = []
  const visiter = (valeur: unknown, chemin: string): void => {
    if (Array.isArray(valeur)) {
      valeur.forEach((entree, index) => visiter(entree, `${chemin}[${index}]`))
      return
    }
    if (!valeur || typeof valeur !== "object") return
    for (const [cle, contenu] of Object.entries(valeur)) {
      const ici = `${chemin}.${cle}`
      if (cle === "leve" && contenu === true) trouvees.push(ici)
      else visiter(contenu, ici)
    }
  }
  visiter(observation, "racine")
  return trouvees
}

const IDENTITE_EPINGLEE = "image-produit-1"

function extensionAttendue(contentType: ContentTypeImageProduit): string {
  const sousType = contentType.slice("image/".length)
  return sousType === "jpeg" ? ".jpg" : `.${sousType}`
}

function cleBrouillonAttendue(contentType: ContentTypeImageProduit): string {
  return `products/brouillons/${IDENTITE_EPINGLEE}${extensionAttendue(
    contentType
  )}`
}

function clePersisteeAttendue(contentType: ContentTypeImageProduit): string {
  return `products/${IDENTITE_EPINGLEE}${extensionAttendue(contentType)}`
}

function espaceAtteint(cle: string): "reserve" | "produits" | "ailleurs" {
  if (cle.startsWith(PREFIXE_BROUILLONS_IMAGE_PRODUIT)) return "reserve"
  if (cle.startsWith(PREFIXE_IMAGES_PRODUIT)) return "produits"
  return "ailleurs"
}

function projectionParType(
  contenu: Record<ContentTypeImageProduit, ReponseObservee>
): Record<string, unknown> {
  return Object.fromEntries(
    CONTENT_TYPES_IMAGE_PRODUIT.map((contentType) => [
      contentType,
      contenu[contentType],
    ])
  )
}

function attenduParType(
  valeur: (contentType: ContentTypeImageProduit) => ReponseObservee
): Record<string, unknown> {
  return Object.fromEntries(
    CONTENT_TYPES_IMAGE_PRODUIT.map((contentType) => [
      contentType,
      valeur(contentType),
    ])
  )
}

export interface ValeurEpingleeStockage {
  readonly nom: string
  readonly etat: EtatStockageRejoue
  jouer(
    stockage: PortStockageImageProduit,
    identite: IdentiteStockage
  ): Promise<unknown>
  readonly attendu: unknown
}

export const VALEURS_EPINGLEES: readonly ValeurEpingleeStockage[] = [
  {
    nom: "la clé de l'objet d'un Brouillon, pour chaque type de contenu autorisé",
    etat: "sain",
    async jouer(stockage, identite) {
      const projection: Record<ContentTypeImageProduit, ReponseObservee> = {
        "image/jpeg": { ok: false, code: "parametre-invalide" },
        "image/png": { ok: false, code: "parametre-invalide" },
        "image/webp": { ok: false, code: "parametre-invalide" },
        "image/avif": { ok: false, code: "parametre-invalide" },
        "image/gif": { ok: false, code: "parametre-invalide" },
      }
      for (const contentType of CONTENT_TYPES_IMAGE_PRODUIT) {
        projection[contentType] = await observer(
          () =>
            stockage.presignerBrouillon({
              draftId: IDENTITE_EPINGLEE,
              contentType,
              size: TAILLE,
            }),
          (valeur) => cleSous(valeur.previewUrl, identite.basePublique)
        )
      }
      return projectionParType(projection)
    },
    attendu: attenduParType((contentType) => ({
      ok: true,
      cle: cleBrouillonAttendue(contentType),
    })),
  },
  {
    nom: "la clé d'une Image produit persistée, pour chaque type de contenu autorisé",
    etat: "sain",
    async jouer(stockage, identite) {
      const projection: Record<ContentTypeImageProduit, ReponseObservee> = {
        "image/jpeg": { ok: false, code: "parametre-invalide" },
        "image/png": { ok: false, code: "parametre-invalide" },
        "image/webp": { ok: false, code: "parametre-invalide" },
        "image/avif": { ok: false, code: "parametre-invalide" },
        "image/gif": { ok: false, code: "parametre-invalide" },
      }
      for (const contentType of CONTENT_TYPES_IMAGE_PRODUIT) {
        projection[contentType] = await observer(
          () =>
            stockage.promouvoirBrouillon({
              draftId: IDENTITE_EPINGLEE,
              contentType,
            }),
          (valeur) => cleSous(valeur.publicUrl, identite.basePublique)
        )
      }
      return projectionParType(projection)
    },
    attendu: attenduParType((contentType) => ({
      ok: true,
      cle: clePersisteeAttendue(contentType),
    })),
  },
  {
    nom: "l'espace réservé est une extension stricte de l'espace des Images produit",
    etat: "sain",
    async jouer() {
      return {
        produits: PREFIXE_IMAGES_PRODUIT,
        brouillons: PREFIXE_BROUILLONS_IMAGE_PRODUIT,
        extensionStricte:
          PREFIXE_BROUILLONS_IMAGE_PRODUIT.startsWith(PREFIXE_IMAGES_PRODUIT) &&
          PREFIXE_BROUILLONS_IMAGE_PRODUIT.length >
            PREFIXE_IMAGES_PRODUIT.length,
      }
    },
    attendu: {
      produits: "products/",
      brouillons: "products/brouillons/",
      extensionStricte: true,
    },
  },
  {
    nom: "la clé d'une Image produit persistée n'atteint jamais l'espace réservé",
    etat: "sain",
    async jouer(stockage, identite) {
      const projection: Record<ContentTypeImageProduit, ReponseObservee> = {
        "image/jpeg": { ok: false, code: "parametre-invalide" },
        "image/png": { ok: false, code: "parametre-invalide" },
        "image/webp": { ok: false, code: "parametre-invalide" },
        "image/avif": { ok: false, code: "parametre-invalide" },
        "image/gif": { ok: false, code: "parametre-invalide" },
      }
      for (const contentType of CONTENT_TYPES_IMAGE_PRODUIT) {
        projection[contentType] = await observer(
          () =>
            stockage.promouvoirBrouillon({
              draftId: IDENTITE_EPINGLEE,
              contentType,
            }),
          (valeur) =>
            espaceAtteint(cleSous(valeur.publicUrl, identite.basePublique))
        )
      }
      return projectionParType(projection)
    },
    attendu: attenduParType(() => ({ ok: true, cle: "produits" })),
  },
  {
    nom: "supprimer une Image produit persistée : sous l'espace des produits oui, sous l'espace réservé non",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        sousProduits: await observer(() =>
          stockage.supprimerImagePersistee(
            `${identite.basePublique}/${clePersisteeAttendue("image/webp")}`
          )
        ),
        sousEspaceReserve: await observer(() =>
          stockage.supprimerImagePersistee(adresseReservee(identite))
        ),
      }
    },
    attendu: {
      sousProduits: { ok: true, cle: null },
      sousEspaceReserve: { ok: false, code: "parametre-invalide" },
    },
  },
  {
    nom: "supprimer une image de Structure : hors de l'espace réservé oui, dedans non",
    etat: "sain",
    async jouer(stockage, identite) {
      return {
        sousProduits: await observer(() =>
          stockage.supprimerImageCategorie(
            `${identite.basePublique}/${clePersisteeAttendue("image/webp")}`
          )
        ),
        horsProduits: await observer(() =>
          stockage.supprimerImageCategorie(
            `${identite.basePublique}/categories/image-produit-1.webp`
          )
        ),
        sousEspaceReserve: await observer(() =>
          stockage.supprimerImageCategorie(adresseReservee(identite))
        ),
      }
    },
    attendu: {
      sousProduits: { ok: true, cle: null },
      horsProduits: { ok: true, cle: null },
      sousEspaceReserve: { ok: false, code: "parametre-invalide" },
    },
  },
]

export async function exigerValeurEpingleeStockage(
  valeur: ValeurEpingleeStockage,
  adaptateur: AdaptateurStockage,
  identite: IdentiteStockage
): Promise<unknown> {
  const observation = await valeur.jouer(adaptateur(valeur.etat), identite)
  expect(observation, `${valeur.nom} — valeur épinglée`).toEqual(valeur.attendu)
  return observation
}
