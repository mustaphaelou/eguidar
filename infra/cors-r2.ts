import { site } from "@/lib/site"

const ORIGINES_DE_DEVELOPPEMENT = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const

/**
 * Les origines depuis lesquelles l'Administration téléverse. La production est
 * servie depuis `site.url` ; le développement local reste explicitement listé
 * parce qu'une origine CORS ne se déduit jamais d'un port ou d'un hôte.
 */
export const ORIGINES_ADMINISTRATION = [
  site.url,
  ...ORIGINES_DE_DEVELOPPEMENT,
] as const

export const BUCKET_R2_PAR_DEFAUT = process.env.R2_BUCKET || "eguidar"

export interface AllowedCorsR2 {
  origins: string[]
  methods: string[]
  headers: string[]
}

export interface RegleCorsR2 {
  id: string
  allowed: AllowedCorsR2
  exposeHeaders: string[]
  maxAgeSeconds: number
}

export interface ArtefactCorsR2 {
  bucket: string
  rules: RegleCorsR2[]
}

export interface RequeteCors {
  origine: string
  methode: string
  entetes?: readonly string[]
}

export function artefactCorsR2(): ArtefactCorsR2 {
  return {
    bucket: BUCKET_R2_PAR_DEFAUT,
    rules: [
      {
        id: "televersement-administration",
        allowed: {
          origins: [...ORIGINES_ADMINISTRATION],
          methods: ["PUT"],
          headers: ["content-type"],
        },
        exposeHeaders: ["ETag"],
        maxAgeSeconds: 3600,
      },
    ],
  }
}

/**
 * Répond la question que le navigateur pose en pré-vol : cette origine
 * peut-elle faire cette méthode avec ces en-têtes ? Le test s'en sert comme
 * d'un simulateur du bucket neuf, sans réseau.
 */
export function corsAutorise(
  artefact: ArtefactCorsR2,
  requete: RequeteCors
): boolean {
  const methode = requete.methode.toUpperCase()

  return artefact.rules.some((regle) => {
    if (!regle.allowed.origins.includes(requete.origine)) return false
    if (!regle.allowed.methods.includes(methode)) return false
    const entetesAutorises = new Set(
      regle.allowed.headers.map((entete) => entete.toLowerCase())
    )
    return (requete.entetes ?? []).every((entete) =>
      entetesAutorises.has(entete.toLowerCase())
    )
  })
}
