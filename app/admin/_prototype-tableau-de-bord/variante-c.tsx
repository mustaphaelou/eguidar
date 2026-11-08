import type { ContextePrototype } from "./contexte"
import { BandeDAlerte } from "./bande-d-alerte"
import { CarteCommandesRecentes } from "./carte-commandes"
import { CarteDuChiffreAffaires } from "./carte-chiffre-affaires"
import { CarteIndicateurs } from "./carte-indicateurs"
import { CarteStockFaible } from "./carte-stock"
import { EnTeteDuTableauDeBord } from "./en-tete"

/**
 * PROTOTYPE (#964) — C, « La bande ».
 *
 * Les alertes quittent leur carte : une bande d'une ligne porte les pastilles
 * vivantes, et le tableau du stock prend toute la largeur. Le pied de la liste
 * des Commandes est une barre d'action qui nomme le nombre de Commandes.
 */
export function VarianteC({ contexte }: { contexte: ContextePrototype }) {
  return (
    <div className="flex flex-col gap-6">
      <EnTeteDuTableauDeBord />

      <CarteIndicateurs
        stats={contexte.stats}
        montantDuChiffreAffaires={contexte.montantDuChiffreAffaires}
      />

      <div className="grid gap-4 lg:grid-cols-7">
        <CarteDuChiffreAffaires
          serie={contexte.serie}
          reglages={contexte.reglages}
          className="lg:col-span-4"
        />
        <CarteCommandesRecentes
          commandes={contexte.commandes}
          total={contexte.totalCommandes}
          forme="barre"
          className="lg:col-span-3"
        />
      </div>

      <div className="flex flex-col gap-4">
        <BandeDAlerte compteurs={contexte.compteurs} />
        <CarteStockFaible stock={contexte.stockFaible} />
      </div>
    </div>
  )
}
