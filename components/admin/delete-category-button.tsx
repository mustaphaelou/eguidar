"use client"

import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface DeleteCategoryState {
  error?: string
}

interface DeleteCategoryButtonProps {
  categoryId: string
  categoryName: string
  productCount: number
  categories: { id: string; name: string }[]
  action: (
    prevState: DeleteCategoryState,
    formData: FormData
  ) => Promise<DeleteCategoryState>
}

export function DeleteCategoryButton({
  categoryId,
  categoryName,
  productCount,
  categories,
  action,
}: DeleteCategoryButtonProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  // « Bloquer — produits rattachés » n'est pas une cible : c'est l'absence de
  // cible, donc `null` dans l'état du `Select` et l'absence du champ caché.
  // Aucune constante n'est exportée d'ici, et le serveur n'a donc rien à
  // reconnaître : `reassignToCategoryId` porte une Structure réelle, ou rien.
  const [reassignTo, setReassignTo] = useState<string | null>(null)
  const targets = categories.filter((candidate) => candidate.id !== categoryId)

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !confirm(
            `Supprimer « ${categoryName} » ? Cette action est définitive.`
          )
        ) {
          event.preventDefault()
        }
      }}
      className="flex flex-col items-end gap-1.5"
    >
      <input type="hidden" name="categoryId" value={categoryId} />
      {productCount > 0 ? (
        <Select value={reassignTo} onValueChange={setReassignTo}>
          <SelectTrigger size="sm" className="max-w-64">
            <SelectValue placeholder="Bloquer — produits rattachés" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={null}>Bloquer — produits rattachés</SelectItem>
              {targets.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  Déplacer les produits vers {target.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
      {reassignTo ? (
        <input type="hidden" name="reassignToCategoryId" value={reassignTo} />
      ) : null}
      {state.error ? (
        <p className="max-w-64 text-end text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="destructive"
        size="sm"
        disabled={isPending}
      >
        {isPending ? "Suppression…" : "Supprimer"}
      </Button>
    </form>
  )
}
