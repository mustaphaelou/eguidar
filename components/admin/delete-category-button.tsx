"use client"

import { useActionState, useId, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
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

interface StructureCible {
  id: string
  name: string
  parentId: string | null
}

/** Ce qui est rattaché à la Structure de la ligne, et donc ce qui pèse. */
interface ComptesStructure {
  childCount: number
  productCount: number
}

interface DeleteCategoryButtonProps {
  categoryId: string
  categoryName: string
  childCount: number
  productCount: number
  categories: StructureCible[]
  action: (
    prevState: DeleteCategoryState,
    formData: FormData
  ) => Promise<DeleteCategoryState>
}

const BOITE_ERREUR =
  "rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"

/**
 * Ce que la ligne dit d'elle-même, avant tout clic. La contrainte n'est pas une
 * surprise réservée à la confirmation : elle est écrite à côté du contrôle que
 * l'éditeur cherchait. Les deux causes que le glossaire énumère — une
 * Structure contenant des sous-catégories, des Produits qui lui sont rattachés —
 * y sont nommées comme lui les nomme, jamais comme un « échec de suppression ».
 */
function raisonVisible(comptes: ComptesStructure): string | null {
  const { childCount, productCount } = comptes
  if (childCount > 0) {
    return `Refus de la Structure : ${childCount} sous-catégorie${childCount > 1 ? "s" : ""} à déplacer`
  }
  if (productCount > 0) {
    // Deux sorties, donc deux mots : la case a cocher rend l'orphelinat
    // saisissable (ADR-0029), et une ligne qui n'en nommerait qu'une
    // mentirait sur ce que la boite va proposer.
    return `Refus de la Structure : ${productCount} Produit${productCount > 1 ? "s" : ""} à réaffecter ou à laisser sans Structure`
  }
  return null
}

/**
 * `candidateId` descend-elle de `racineId` ? La liste des Structures est
 * complète — la page lui passe tout l'arbre —, donc la remontée de parente en
 * parente suffit. Rattacher une Structure à l'une de ses descendantes
 * refermerait la boucle sur elle-même : la boîte ne propose pas ce qui
 * produirait le refus du serveur.
 *
 * **Ce n'est pas `assertAcyclicCategoryTree`, et l'écart reste volontaire.**
 * Les deux marches portent le même garde depuis que le serveur garde, lui
 * aussi, les identifiants qu'il visite : ce manque était un piège nommé
 * d'ADR-0027, et il est un refus. Elles ne peuvent pas fusionner pour autant :
 * l'une raisonne sur des faits engagés, l'autre sur l'arbre rendu à l'écran —
 * et l'écart se voit sur un cycle déjà en base. `vus` arrête ici la remontée
 * sans rien refuser : la cible y est encore proposée, et c'est le serveur seul
 * qui peut dire que sa chaîne est cyclique. La garantie commune reste donc le
 * refus d'une cible cyclique, et c'est toujours le serveur qui l'exige.
 */
function descendDe(
  candidateId: string,
  racineId: string,
  parentParId: Map<string, string | null>
): boolean {
  let curseur: string | null = candidateId
  const vus = new Set<string>()
  while (curseur && !vus.has(curseur)) {
    if (curseur === racineId) return true
    vus.add(curseur)
    curseur = parentParId.get(curseur) ?? null
  }
  return false
}

export function DeleteCategoryButton({
  categoryId,
  categoryName,
  childCount,
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
  const [reparentTo, setReparentTo] = useState<string | null>(null)
  // **Les deux choix s'excluent, et c'est l'interface qui l'exige.** Le
  // serveur départage la réaffectation sur l'orphelinat quand les deux
  // arrivent, mais une boîte qui proposerait les deux à la fois laisserait
  // croire qu'ils s'appliquent ensemble. Cocher l'un efface l'autre : un seul
  // choix, une seule conséquence.
  const [orphelinats, setOrphelinats] = useState(false)
  const idProduits = useId()
  const idSousCategories = useId()
  const idOrphelins = useId()

  const parentParId = new Map(
    categories.map((candidate) => [candidate.id, candidate.parentId])
  )
  // Toute Structure de la liste sauf celle-ci : c'est le domaine de tous les
  // choix. Les sous-catégories, elles, ne peuvent recevoir que ce qui n'en
  // descend pas — une cible y fermerait la boucle sur elle-même.
  const structuresCandidates = categories.filter(
    (candidate) => candidate.id !== categoryId
  )
  const structuresDAccueil = structuresCandidates.filter(
    (candidate) => !descendDe(candidate.id, categoryId, parentParId)
  )

  const comptes = { childCount, productCount }
  const raison = raisonVisible(comptes)
  const enfants = comptes.childCount > 0
  const produits = comptes.productCount > 0
  const confirmation = enfants || produits

  return (
    <div className="flex flex-col items-end gap-1.5">
      {raison ? (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          {raison}
        </p>
      ) : null}

      {confirmation ? (
        <div className="flex flex-col items-end gap-1.5">
          {/* La suppression seule est refusée par le serveur tant que les
              sous-catégories restent là : le contrôle le dit, et ne ment pas. */}
          {enfants ? (
            <Button variant="destructive" size="sm" disabled>
              {isPending ? "Suppression…" : "Supprimer"}
            </Button>
          ) : null}
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant={enfants ? "outline" : "destructive"}
                  size="sm"
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
                          {structuresDAccueil.map((accueil) => (
                            <SelectItem key={accueil.id} value={accueil.id}>
                              Déplacer les sous-catégories vers {accueil.name}
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
                          {structuresCandidates.map((cible) => (
                            <SelectItem key={cible.id} value={cible.id}>
                              Déplacer les produits vers {cible.name}
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

                    {/* La troisième issue (ADR-0029). Elle est une case et non
                        une option du `Select` parce qu'elle n'est pas une cible :
                        c'est l'absence de cible que l'éditeur exprime, et une
                        sentinelle à travers la frontière asynchrone serait
                        remplacée par un mandataire — le serveur ne verrait
                        jamais la valeur qui compte. La case cochée porte un
                        `on`, rien à comparer. */}
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
        /* Feuille vide : rien à choisir, rien à nommer — et c'est pour cela
           qu'un `confirm()` suffit. La boîte de dialogue a remplacé
           `confirm()` parce qu'elle **montrait ce que la suppression emportait** :
           où partaient les Produits, où partaient les sous-catégories. Une
           feuille vide n'a rien de tout cela à montrer, et son seul avertissement
           est « cette action est définitive » — une phrase. Lui ouvrir une boîte
           entière pour cela serait du poids mort ; elle resterait le seul cas du
           dépôt sans confirmation, ce que #519 n'a jamais demandé de changer. */
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
          {state.error ? <p className={BOITE_ERREUR}>{state.error}</p> : null}
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={isPending}
          >
            {isPending ? "Suppression…" : "Supprimer"}
          </Button>
        </form>
      )}
    </div>
  )
}
