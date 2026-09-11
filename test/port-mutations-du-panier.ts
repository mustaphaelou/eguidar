import type { PortMutationsDuPanier } from "@/components/storefront/use-mutations-du-panier"
import type { ResultatPanier } from "@/lib/panier"

export type AppelPanier =
  | { operation: "ajouter"; variantId: string; quantity: number }
  | { operation: "modifier"; variantId: string; quantity: number }
  | { operation: "retirer"; variantId: string }

export function creerPortPanierEnMemoire(
  repondre?: (appel: AppelPanier) => ResultatPanier | Promise<ResultatPanier>
): PortMutationsDuPanier & { appels: AppelPanier[] } {
  const appels: AppelPanier[] = []

  async function reponse(appel: AppelPanier): Promise<ResultatPanier> {
    return repondre ? repondre(appel) : { ok: true }
  }

  return {
    appels,
    async ajouter(variantId, quantity) {
      const appel: AppelPanier = { operation: "ajouter", variantId, quantity }
      appels.push(appel)
      return reponse(appel)
    },
    async modifier(variantId, quantity) {
      const appel: AppelPanier = { operation: "modifier", variantId, quantity }
      appels.push(appel)
      return reponse(appel)
    },
    async retirer(variantId) {
      const appel: AppelPanier = { operation: "retirer", variantId }
      appels.push(appel)
      return reponse(appel)
    },
  }
}
