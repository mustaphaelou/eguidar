import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import type { ContextePrototype } from "./contexte"
import { alertesVides } from "./donnees"
import { CarteCommandesRecentes } from "./carte-commandes"
import { CarteDuChiffreAffaires } from "./carte-chiffre-affaires"
import { CarteIndicateurs } from "./carte-indicateurs"
import { CarteStockFaible } from "./carte-stock"
import { EnTeteDuTableauDeBord } from "./en-tete"
import { LigneCalme } from "./ligne-calme"
import { LignesDAlerte } from "./lignes-d-alerte"

/**
 * PROTOTYPE (#964) — A, « Le contrat ».
 *
 * La charte prise au mot : les deux cartes de la troisième bande restent
 * séparées, l'alerte « Stock faible » renvoie au tableau juste à côté, le pied
 * de la liste des Commandes est la ligne passive `Tout voir`, et l'empilement
 * suit l'ordre du document.
 */
export function VarianteA({ contexte }: { contexte: ContextePrototype }) {
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
          forme="passive"
          className="lg:col-span-3"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>À surveiller</CardTitle>
            <CardDescription>
              Les points qui demandent une action aujourd’hui.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <LignesDAlerte compteurs={contexte.compteurs} />
            {alertesVides(contexte.compteurs) ? <LigneCalme /> : null}
          </CardContent>
        </Card>

        <CarteStockFaible
          stock={contexte.stockFaible}
          className="lg:col-span-4"
        />
      </div>
    </div>
  )
}
