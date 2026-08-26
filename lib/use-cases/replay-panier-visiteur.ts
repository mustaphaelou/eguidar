import { rejouerPanierVisiteur } from "@/lib/panier"

export function replayPanierVisiteur(compteId: string): Promise<void> {
  return rejouerPanierVisiteur({ role: "client", compteId })
}
