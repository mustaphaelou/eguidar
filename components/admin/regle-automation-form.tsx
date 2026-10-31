"use client"

import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  actionsOffertes,
  conditionsOffertes,
  DECLENCHEURS_AUTOMATION,
  LIBELLES_ACTION,
  LIBELLES_CONDITION,
  LIBELLES_DECLENCHEUR,
  type ActionAutomation,
  type TypeConditionAutomation,
  type TypeEvenementAutomation,
} from "@/lib/automations/vocabulaire"

export interface RegleFormulaireState {
  error?: string
}

export interface RegleFormulaireInitiale {
  id?: string
  nom: string
  declencheur: TypeEvenementAutomation
  condition: { type: TypeConditionAutomation; statuts?: readonly string[] }
  action: ActionAutomation
  configuration?: { destinataireVariable: string }
  actif: boolean
}

interface RegleAutomationFormProps {
  regle?: RegleFormulaireInitiale
  statuts: { valeur: string; libelle: string }[]
  action: (
    prevState: RegleFormulaireState,
    formData: FormData
  ) => Promise<RegleFormulaireState>
}

const BOITE_ERREUR =
  "rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"

/**
 * L'éditeur ne propose que le vocabulaire fermé (ADR-0044) : les actions
 * offertes dépendent du déclencheur, une action qui écrirait la table
 * observée n'y figure jamais, et le destinataire d'un digest est un **nom** de
 * variable d'environnement.
 */
export function RegleAutomationForm({
  regle,
  statuts,
  action,
}: RegleAutomationFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const [declencheur, setDeclencheur] = useState<TypeEvenementAutomation>(
    regle?.declencheur ?? DECLENCHEURS_AUTOMATION[0]!
  )
  const [actionChoisie, setActionChoisie] = useState<ActionAutomation>(
    regle?.action ?? actionsOffertes(DECLENCHEURS_AUTOMATION[0]!)[0]!
  )
  const [conditionType, setConditionType] = useState<TypeConditionAutomation>(
    regle?.condition.type ?? "toujours"
  )

  const actionsDisponibles = actionsOffertes(declencheur)
  const conditionsDisponibles = conditionsOffertes(declencheur)
  const actionEffective = actionsDisponibles.includes(actionChoisie)
    ? actionChoisie
    : actionsDisponibles[0]!
  const conditionEffective = conditionsDisponibles.includes(conditionType)
    ? conditionType
    : conditionsDisponibles[0]!
  const destinataireVisible = actionEffective.startsWith("digest.")

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {regle?.id ? (
        <input type="hidden" name="regleId" value={regle.id} />
      ) : null}
      <input type="hidden" name="declencheur" value={declencheur} />
      <input type="hidden" name="action" value={actionEffective} />
      <input type="hidden" name="conditionType" value={conditionEffective} />

      {state.error ? (
        <p role="alert" className={BOITE_ERREUR}>
          {state.error}
        </p>
      ) : null}

      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>La Règle</CardTitle>
          <CardDescription>
            Le déclencheur décide des conditions et des actions offertes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nom">Nom</Label>
            <Input
              id="nom"
              name="nom"
              required
              defaultValue={regle?.nom}
              placeholder="Relance du stock bas"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="declencheur">Déclencheur</Label>
              <Select
                value={declencheur}
                onValueChange={(valeur) =>
                  setDeclencheur(valeur as TypeEvenementAutomation)
                }
              >
                <SelectTrigger id="declencheur" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DECLENCHEURS_AUTOMATION.map((valeur) => (
                      <SelectItem key={valeur} value={valeur}>
                        {LIBELLES_DECLENCHEUR[valeur]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="action">Action</Label>
              <Select
                value={actionEffective}
                onValueChange={(valeur) =>
                  setActionChoisie(valeur as ActionAutomation)
                }
              >
                <SelectTrigger id="action" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {actionsDisponibles.map((valeur) => (
                      <SelectItem key={valeur} value={valeur}>
                        {LIBELLES_ACTION[valeur]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="condition">Condition</Label>
              <Select
                value={conditionEffective}
                onValueChange={(valeur) =>
                  setConditionType(valeur as TypeConditionAutomation)
                }
              >
                <SelectTrigger id="condition" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {conditionsDisponibles.map((valeur) => (
                      <SelectItem key={valeur} value={valeur}>
                        {LIBELLES_CONDITION[valeur]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {destinataireVisible ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="destinataireVariable">
                  Variable du destinataire
                </Label>
                <Input
                  id="destinataireVariable"
                  name="destinataireVariable"
                  defaultValue={regle?.configuration?.destinataireVariable}
                  placeholder="ADMIN_EMAIL"
                  pattern="[A-Z][A-Z0-9_]*"
                />
                <p className="text-sm text-muted-foreground">
                  Un nom de variable d&apos;environnement, jamais une adresse :
                  la valeur reste dans l&apos;environnement et n&apos;apparaît
                  ni ici ni dans les journaux.
                </p>
              </div>
            ) : null}
          </div>

          {conditionEffective === "statut-commande" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Statuts retenus</legend>
              <div className="flex flex-wrap gap-4">
                {statuts.map((statut) => (
                  <div key={statut.valeur} className="flex items-center gap-2">
                    <Checkbox
                      id={`statut-${statut.valeur}`}
                      name="statuts"
                      value={statut.valeur}
                      defaultChecked={regle?.condition.statuts?.includes(
                        statut.valeur
                      )}
                    />
                    <Label htmlFor={`statut-${statut.valeur}`}>
                      {statut.libelle}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <Checkbox
              id="actif"
              name="actif"
              defaultChecked={regle?.actif ?? true}
              className="mt-0.5"
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="actif">Règle active</Label>
              <p className="text-xs text-muted-foreground">
                Une règle inactive reste enregistrée mais ne s’exécute pas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer la règle"}
        </Button>
      </div>
    </form>
  )
}
