"use client"

import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPortal,
  ComboboxPopup,
  ComboboxPositioner,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { Label } from "@/components/ui/label"

export interface StructureAvecChemin {
  id: string
  nom: string
  chemin: string
}

/**
 * Le sélecteur de Structure du formulaire Produit : l'option affichée est le
 * chemin entier lu par la Lecture de la Structure, pour que deux branches qui
 * partagent une feuille restent distinctes. Il ne rend que l'identifiant.
 */
export function StructurePicker({
  id,
  valeur,
  structures,
  onChange,
  description,
  placeholder = "Choisir une Structure",
}: {
  id: string
  valeur: string
  structures: StructureAvecChemin[]
  onChange: (id: string) => void
  description?: React.ReactNode
  placeholder?: string
}) {
  const selection =
    structures.find((structure) => structure.id === valeur) ?? null

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Structure</Label>
      <Combobox
        items={structures}
        value={selection}
        onValueChange={(structure) => onChange(structure?.id ?? "")}
        itemToStringLabel={(structure) => structure.chemin}
        itemToStringValue={(structure) => structure.id}
        isItemEqualToValue={(a, b) => a.id === b.id}
      >
        <ComboboxInputGroup>
          <ComboboxInput id={id} placeholder={placeholder} />
          <ComboboxTrigger aria-label="Ouvrir la liste des Structures" />
        </ComboboxInputGroup>
        <ComboboxPortal>
          <ComboboxPositioner sideOffset={4}>
            <ComboboxPopup>
              <ComboboxEmpty>
                Aucune Structure ne correspond à cette recherche.
              </ComboboxEmpty>
              <ComboboxList>
                {(structure: StructureAvecChemin) => (
                  <ComboboxItem key={structure.id} value={structure}>
                    {structure.chemin}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </ComboboxPositioner>
        </ComboboxPortal>
      </Combobox>
      {description}
    </div>
  )
}
