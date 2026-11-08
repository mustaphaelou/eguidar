import type { ContextePrototype } from "./contexte"
import { CarteCommandesRecentes } from "./carte-commandes"
import { CarteDuChiffreAffaires } from "./carte-chiffre-affaires"
import { CarteIndicateurs } from "./carte-indicateurs"
import { CarteSurveillance } from "./carte-surveillance"
import { EnTeteDuTableauDeBord } from "./en-tete"

/**
 * PROTOTYPE (#964) — B, « Le guichet ».
 *
 * Une seule carte « À surveiller » porte le stock faible ; l'alerte qui
 * renvoyait au tableau disparaît. Le pied de la liste des Commandes est son
 * dernier élément. Sous `lg`, l'action passe devant : la surveillance, puis
 * les Commandes, puis le graphique.
 */
export function VarianteB({ contexte }: { contexte: ContextePrototype }) {
  return (
    <div className="flex flex-col gap-6">
      <EnTeteDuTableauDeBord />

      <CarteIndicateurs
        stats={contexte.stats}
        montantDuChiffreAffaires={contexte.montantDuChiffreAffaires}
      />

      <div className="order-3 grid gap-4 lg:order-none lg:grid-cols-7">
        <CarteDuChiffreAffaires
          serie={contexte.serie}
          reglages={contexte.reglages}
          className="order-2 lg:order-none lg:col-span-4"
        />
        <CarteCommandesRecentes
          commandes={contexte.commandes}
          total={contexte.totalCommandes}
          forme="derniere-ligne"
          className="order-1 lg:order-none lg:col-span-3"
        />
      </div>

      <CarteSurveillance
        compteurs={contexte.compteurs}
        stock={contexte.stockFaible}
        className="order-2 lg:order-none"
      />
    </div>
  )
}
