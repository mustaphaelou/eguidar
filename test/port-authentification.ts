import type {
  EntreeConnexionParMotDePasse,
  EntreeConnexionSociale,
  EntreeEnvoiCode,
  EntreeInscription,
  EntreeVerificationCode,
  PortAuthentification,
  ResultatAuthentification,
} from "@/components/auth/port-authentification"

export type AppelAuthentification =
  | ({ operation: "connexionParMotDePasse" } & EntreeConnexionParMotDePasse)
  | ({ operation: "inscription" } & EntreeInscription)
  | ({ operation: "connexionSociale" } & EntreeConnexionSociale)
  | ({ operation: "envoyerCode" } & EntreeEnvoiCode)
  | ({ operation: "verifierCode" } & EntreeVerificationCode)

export type RepondreAuthentification = (
  appel: AppelAuthentification
) => ResultatAuthentification | Promise<ResultatAuthentification>

export interface PortAuthentificationEnMemoire extends PortAuthentification {
  appels: AppelAuthentification[]
  repondre: RepondreAuthentification
}

export function creerPortAuthentificationEnMemoire(
  repondre: RepondreAuthentification = () => ({ error: null })
): PortAuthentificationEnMemoire {
  const appels: AppelAuthentification[] = []

  const port: PortAuthentificationEnMemoire = {
    appels,
    repondre,

    async connexionParMotDePasse(entree) {
      const appel: AppelAuthentification = {
        operation: "connexionParMotDePasse",
        ...entree,
      }
      appels.push(appel)
      return port.repondre(appel)
    },

    async inscription(entree) {
      const appel: AppelAuthentification = {
        operation: "inscription",
        ...entree,
      }
      appels.push(appel)
      return port.repondre(appel)
    },

    async connexionSociale(entree) {
      const appel: AppelAuthentification = {
        operation: "connexionSociale",
        ...entree,
      }
      appels.push(appel)
      return port.repondre(appel)
    },

    async envoyerCode(entree) {
      const appel: AppelAuthentification = {
        operation: "envoyerCode",
        ...entree,
      }
      appels.push(appel)
      return port.repondre(appel)
    },

    async verifierCode(entree) {
      const appel: AppelAuthentification = {
        operation: "verifierCode",
        ...entree,
      }
      appels.push(appel)
      return port.repondre(appel)
    },
  }

  return port
}
