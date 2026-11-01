"use client"

import { useActionState, useId, useRef, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
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

interface ComptesStructure {
  childCount: number
  productCount: number
}

interface DeleteCategoryButtonProps {
  categoryId: string
  categoryName: string
  childCount: number
  productCount: number
  ciblesProduits: readonly string[]
  ciblesSousCategories: readonly string[]
  nomsStructures: Readonly<Record<string, string>>
  action: (
    prevState: DeleteCategoryState,
    formData: FormData
  ) => Promise<DeleteCategoryState>
}

const BOITE_ERREUR =
  "rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"

function raisonVisible(comptes: ComptesStructure): string | null {
  const { childCount, productCount } = comptes
  if (childCount > 0) {
    return `Refus de la Structure : ${childCount} sous-catégorie${childCount > 1 ? "s" : ""} à déplacer`
  }
  if (productCount > 0) {
    return `Refus de la Structure : ${productCount} Produit${productCount > 1 ? "s" : ""} à réaffecter ou à laisser sans Structure`
  }
  return null
}

export function DeleteCategoryButton({
  categoryId,
  categoryName,
  childCount,
  productCount,
  ciblesProduits,
  ciblesSousCategories,
  nomsStructures,
  action,
}: DeleteCategoryButtonProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const [reassignTo, setReassignTo] = useState<string | null>(null)
  const [reparentTo, setReparentTo] = useState<string | null>(null)
  const [orphelinats, setOrphelinats] = useState(false)
  const annulerRef = useRef<HTMLButtonElement>(null)
  const idProduits = useId()
  const idSousCategories = useId()
  const idOrphelins = useId()

  const nomDe = (id: string): string => nomsStructures[id] ?? id

  const comptes = { childCount, productCount }
  const raison = raisonVisible(comptes)
  const enfants = comptes.childCount > 0
  const produits = comptes.productCount > 0
  const confirmation = enfants || produits

  return (
    <div className="flex flex-col items-end gap-1.5">
      {raison ? (
        <p className="sr-only">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          {raison}
        </p>
      ) : null}

      {confirmation ? (
        <div className="flex flex-col items-end gap-1.5">
          {enfants ? (
            <Button variant="destructive" size="sm" disabled>
              {isPending ? "Suppression…" : "Supprimer"}
            </Button>
          ) : null}
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={
                    enfants
                      ? undefined
                      : "text-destructive hover:bg-destructive/10 hover:text-destructive"
                  }
                />
              }
            >
              {isPending
                ? "Suppression…"
                : enfants
                  ? "Déplacer puis supprimer"
                  : "Supprimer"}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-lg">
                  Supprimer « {categoryName} »
                </DialogTitle>
                <DialogDescription>
                  Cette Structure compte {childCount} sous-catégorie
                  {childCount > 1 ? "s" : ""} et {productCount} Produit
                  {productCount > 1 ? "s" : ""} rattaché
                  {productCount > 1 ? "s" : ""}. La suppression est définitive.
                </DialogDescription>
              </DialogHeader>
              <form action={formAction} className="flex flex-col gap-4">
                <input type="hidden" name="categoryId" value={categoryId} />

                {enfants ? (
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor={idSousCategories}>
                      Déplacer les sous-catégories vers
                    </FieldLabel>
                    <Select value={reparentTo} onValueChange={setReparentTo}>
                      <SelectTrigger id={idSousCategories} size="sm">
                        <SelectValue placeholder="Choisir la Structure d'accueil des sous-catégories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ciblesSousCategories.map((cible) => (
                            <SelectItem key={cible} value={cible}>
                              Déplacer les sous-catégories vers {nomDe(cible)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {reparentTo ? (
                      <input
                        type="hidden"
                        name="reparentChildrenToCategoryId"
                        value={reparentTo}
                      />
                    ) : null}
                  </Field>
                ) : null}

                {produits ? (
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor={idProduits}>
                      Déplacer les produits vers
                    </FieldLabel>
                    <Select
                      value={orphelinats ? null : reassignTo}
                      onValueChange={(value) => {
                        setReassignTo(value ?? null)
                        if (value) setOrphelinats(false)
                      }}
                      disabled={orphelinats}
                    >
                      <SelectTrigger id={idProduits} size="sm">
                        <SelectValue placeholder="Bloquer — produits rattachés" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={null}>
                            Bloquer — produits rattachés
                          </SelectItem>
                          {ciblesProduits.map((cible) => (
                            <SelectItem key={cible} value={cible}>
                              Déplacer les produits vers {nomDe(cible)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {reassignTo ? (
                      <input
                        type="hidden"
                        name="reassignToCategoryId"
                        value={reassignTo}
                      />
                    ) : null}

                    {}
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox
                        id={idOrphelins}
                        checked={orphelinats}
                        onCheckedChange={(coche) => {
                          setOrphelinats(coche === true)
                          if (coche === true) setReassignTo(null)
                        }}
                      />
                      <Label
                        htmlFor={idOrphelins}
                        className="text-sm leading-snug"
                      >
                        Laisser les {productCount} Produit
                        {productCount > 1 ? "s" : ""} sans Structure — ils
                        restent en vente, hors de toute catégorie
                      </Label>
                    </div>
                    {orphelinats ? (
                      <input type="hidden" name="orphanProducts" value="on" />
                    ) : null}
                  </Field>
                ) : null}

                {state.error ? (
                  <p className={BOITE_ERREUR}>{state.error}</p>
                ) : null}

                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Annuler
                  </DialogClose>
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={isPending || (enfants && !reparentTo)}
                  >
                    {isPending ? "Suppression…" : "Supprimer définitivement"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isPending}
              />
            }
          >
            {isPending ? "Suppression…" : "Supprimer"}
          </AlertDialogTrigger>
          <AlertDialogContent initialFocus={annulerRef}>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">
                Supprimer « {categoryName} »
              </AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est définitive.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="categoryId" value={categoryId} />
              {state.error ? (
                <p className={BOITE_ERREUR}>{state.error}</p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogClose
                  render={<Button ref={annulerRef} variant="outline" />}
                >
                  Annuler
                </AlertDialogClose>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isPending}
                >
                  {isPending ? "Suppression…" : "Supprimer définitivement"}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
