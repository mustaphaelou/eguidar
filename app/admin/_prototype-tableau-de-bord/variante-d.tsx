import type { ContextePrototype } from "./contexte"
import { CarteCommandesRecentes } from "./carte-commandes"
import { CarteDuChiffreAffaires } from "./carte-chiffre-affaires"
import { CarteIndicateurs } from "./carte-indicateurs"
import { CarteSurveillance } from "./carte-surveillance"
import { EnTeteDuTableauDeBord } from "./en-tete"

/**
 * PROTOTYPE (#964) — D, « La retenue ».
 *
 * Ce que le prototype garde des trois lectures :
 * — le bandeau 4/7 + 3/7 de A, avec le graphique à 260 px **minimum** et sa
 *   liste de Commandes qui grandit ;
 * — le pied d'action de C, un bouton qui nomme le nombre de Commandes ;
 * — la carte fusionnée de B pour la troisième bande, en deux colonnes sur lg,
 *   et l'ordre du document rétabli sous lg (graphique, Commandes, surveillance).
 *
 * C'est la page que #965 doit construire ; A, B et C restent les expériences.
 */
export function VarianteD({ contexte }: { contexte: ContextePrototype }) {
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

      <CarteSurveillance
        compteurs={contexte.compteurs}
        stock={contexte.stockFaible}
      />
    </div>
  )
}
