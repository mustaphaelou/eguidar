"use client"

import { useId, useState, useTransition } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import type {
  CibleDeplacement,
  IntentionsDeplacement,
} from "@/app/admin/categories/intentions-de-deplacement"

export interface MaillonDeChemin {
  name: string
  slug: string
}

export interface LigneStructureVue {
  id: string
  name: string
  slug: string
  image: string | null
  parentId: string | null
  profondeur: number
  position: number
  nombreFreres: number
  nombreProduits: number
  nombreProduitsCumules: number
  nombreEnfants: number
  horsArbre: boolean
  chemin: MaillonDeChemin[]
}

export interface DestinationStructure {
  id: string
  libelle: string
}

export interface DeplacementState {
  error?: string
  message?: string
}

export type ActionDeplacement = (
  precedent: DeplacementState,
  formData: FormData
) => Promise<DeplacementState>

interface DeplacementStructureProps {
  ligne: LigneStructureVue
  destinations: readonly DestinationStructure[]
  action: ActionDeplacement
  onResultat: (resultat: { texte: string; refus: boolean }) => void
}

const BOITE_ERREUR =
  "rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"

interface BoutonDeGesteProps {
  libelle: string
  nomStructure: string
  intention: CibleDeplacement | null
  categorieId: string
  enAttente: boolean
  icone: typeof ArrowUp01Icon
  formAction: (formData: FormData) => void
}

function BoutonDeGeste({
  libelle,
  nomStructure,
  intention,
  categorieId,
  enAttente,
  icone,
  formAction,
}: BoutonDeGesteProps) {
  const etiquette = `${libelle} ${nomStructure}`
  const contenu = (
    <HugeiconsIcon icon={icone} strokeWidth={2} aria-hidden="true" />
  )

  if (!intention) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={etiquette}
        disabled
      >
        {contenu}
      </Button>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="categoryId" value={categorieId} />
      <input
        type="hidden"
        name="nouvelleParenteId"
        value={intention.nouvelleParenteId ?? ""}
      />
      <input type="hidden" name="avantId" value={intention.avantId ?? ""} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-xs"
        aria-label={etiquette}
        disabled={enAttente}
      >
        {contenu}
      </Button>
    </form>
  )
}

/**
 * Les quatre gestes d'ordre d'une Structure. Ils vivent dans la colonne
 * « Position », avec la position qu'ils changent, plutôt que d'empiler une
 * troisième rangée de boutons dans la colonne des actions.
 */
export function GestesStructure({
  ligne,
  intentions,
  action,
  onResultat,
}: {
  ligne: LigneStructureVue
  intentions: IntentionsDeplacement
  action: ActionDeplacement
  onResultat: (resultat: { texte: string; refus: boolean }) => void
}) {
  const [state, setState] = useState<DeplacementState>({})
  const [enAttente, demarrer] = useTransition()

  const formAction = (formData: FormData): void => {
    demarrer(async () => {
      const resultat = await action(state, formData)
      if (resultat.message) {
        setState({})
        onResultat({ texte: resultat.message, refus: false })
      } else {
        setState(resultat)
        if (resultat.error) {
          onResultat({ texte: resultat.error, refus: true })
        }
      }
    })
  }

  return (
    <div
      role="group"
      aria-label={`Déplacer ${ligne.name} dans l'arbre`}
      className="flex items-center gap-0.5 rounded-md border bg-background p-0.5"
    >
      <BoutonDeGeste
        libelle="Monter"
        nomStructure={ligne.name}
        intention={intentions.monter}
        categorieId={ligne.id}
        enAttente={enAttente}
        icone={ArrowUp01Icon}
        formAction={formAction}
      />
      <BoutonDeGeste
        libelle="Descendre"
        nomStructure={ligne.name}
        intention={intentions.descendre}
        categorieId={ligne.id}
        enAttente={enAttente}
        icone={ArrowDown01Icon}
        formAction={formAction}
      />
      <BoutonDeGeste
        libelle="Indenter"
        nomStructure={ligne.name}
        intention={intentions.indenter}
        categorieId={ligne.id}
        enAttente={enAttente}
        icone={ArrowRight01Icon}
        formAction={formAction}
      />
      <BoutonDeGeste
        libelle="Désindenter"
        nomStructure={ligne.name}
        intention={intentions.desindenter}
        categorieId={ligne.id}
        enAttente={enAttente}
        icone={ArrowLeft01Icon}
        formAction={formAction}
      />
    </div>
  )
}

export function DeplacementStructure({
  ligne,
  destinations,
  action,
  onResultat,
}: DeplacementStructureProps) {
  const [state, setState] = useState<DeplacementState>({})
  const [enAttente, demarrer] = useTransition()
  const [ouvert, setOuvert] = useState(false)
  const [destination, setDestination] = useState<string | null>(null)
  const idDestination = useId()

  const formAction = (formData: FormData): void => {
    demarrer(async () => {
      const resultat = await action(state, formData)
      if (resultat.message) {
        setState({})
        setOuvert(false)
        onResultat({ texte: resultat.message, refus: false })
      } else {
        setState(resultat)
        if (resultat.error) {
          onResultat({ texte: resultat.error, refus: true })
        }
      }
    })
  }

  const libelleDe = (id: string): string =>
    destinations.find((candidate) => candidate.id === id)?.libelle ?? id

  const idsDesDestinations = destinations
    .filter((candidate) => candidate.id !== ligne.id)
    .map((candidate) => candidate.id)

  const changerOuverture = (prochain: boolean): void => {
    setOuvert(prochain)
    if (prochain) {
      setDestination(null)
      setState({})
    }
  }

  const boutonDeplacement = ligne.horsArbre ? "Rattacher…" : "Déplacer sous…"

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Dialog open={ouvert} onOpenChange={changerOuverture}>
        <DialogTrigger
          render={
            <Button
              variant={ligne.horsArbre ? "destructive" : "outline"}
              size="sm"
              aria-label={
                ligne.horsArbre
                  ? `Rattacher ${ligne.name}`
                  : `Déplacer ${ligne.name} sous une autre Structure`
              }
            />
          }
        >
          <HugeiconsIcon icon={Link01Icon} strokeWidth={2} aria-hidden="true" />
          {boutonDeplacement}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">
              {ligne.horsArbre ? "Rattacher" : "Déplacer"} « {ligne.name} »
            </DialogTitle>
            <DialogDescription>
              Choisissez la Structure de destination. « {ligne.name} » y
              deviendra la dernière sous-catégorie.
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="categoryId" value={ligne.id} />
            <input type="hidden" name="avantId" value="" />

            <Field className="gap-1.5">
              <FieldLabel htmlFor={idDestination}>
                Structure de destination
              </FieldLabel>
              <Combobox
                items={idsDesDestinations}
                value={destination}
                onValueChange={(valeur) =>
                  setDestination(typeof valeur === "string" ? valeur : null)
                }
                itemToStringLabel={(id) => libelleDe(id)}
              >
                <ComboboxInputGroup>
                  <ComboboxInput
                    id={idDestination}
                    placeholder="Rechercher une Structure"
                  />
                  <ComboboxTrigger aria-label="Ouvrir la liste des destinations" />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Aucune Structure ne correspond.</ComboboxEmpty>
                  <ComboboxList>
                    {(id: string) => (
                      <ComboboxItem key={id} value={id}>
                        {libelleDe(id)}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>

            {destination ? (
              <input
                type="hidden"
                name="nouvelleParenteId"
                value={destination}
              />
            ) : null}

            {state.error ? <p className={BOITE_ERREUR}>{state.error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Annuler
              </DialogClose>
              <Button type="submit" disabled={!destination || enAttente}>
                {enAttente ? "Déplacement…" : "Déplacer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {state.error ? <p className={BOITE_ERREUR}>{state.error}</p> : null}
    </div>
  )
}
