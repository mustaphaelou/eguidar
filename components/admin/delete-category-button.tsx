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
import { NO_PARENT_VALUE } from "@/components/admin/category-form"

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
  const [reassignTo, setReassignTo] = useState(NO_PARENT_VALUE)
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
        <Select
          value={reassignTo}
          onValueChange={(value) => setReassignTo(value ?? NO_PARENT_VALUE)}
        >
          <SelectTrigger size="sm" className="max-w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NO_PARENT_VALUE}>
                Bloquer — produits rattachés
              </SelectItem>
              {targets.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  Déplacer les produits vers {target.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
      <input type="hidden" name="reassignToCategoryId" value={reassignTo} />
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
