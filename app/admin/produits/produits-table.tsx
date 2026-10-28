"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Delete01Icon,
  MoreHorizontalIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  type DataTableFacetedFilterOption,
} from "@/components/data-table"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPrice } from "@/lib/money"
import {
  CHAMP_IDS_LOT,
  CHAMP_STRUCTURE_LOT,
  CHAMP_VALEUR_LOT,
  messageDuRapport,
  type RapportLot,
} from "@/lib/produit-bulk"
import {
  ACTIONS_COLUMN_ID,
  DATE_COLUMN_ID,
  LIVRAISON_OFFERTE_COLUMN_ID,
  MISE_EN_AVANT_COLUMN_ID,
  NOM_COLUMN_ID,
  PRIX_COLUMN_ID,
  PRODUIT_STOCK_NON_NUL,
  PRODUIT_STOCK_ZERO,
  PRODUIT_STRUCTURE_SANS,
  SELECTION_COLUMN_ID,
  STOCK_COLUMN_ID,
  STRUCTURE_COLUMN_ID,
  type ProduitListingParams,
} from "@/lib/produit-listing"
import type {
  AdminProductsPage,
  FaitsProduitListe,
} from "@/lib/use-cases/admin-catalog"

import { useProduitListing } from "./use-produit-listing"

const STATUT_COLUMN_ID = "statut"

export type ProduitLotState = {
  error?: string
  rapport?: RapportLot
}

export type ProduitLotAction = (
  prevState: ProduitLotState,
  formData: FormData
) => Promise<ProduitLotState>

export interface ProduitsTableActions {
  setStructure: ProduitLotAction
  setFeatured: ProduitLotAction
  setFreeShipping: ProduitLotAction
  delete: ProduitLotAction
  duplicate: ProduitLotAction
}

export interface StructureDuFiltre {
  id: string
  chemin: string
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })

const COLONNES_CACHEES = {
  [MISE_EN_AVANT_COLUMN_ID]: false,
  [LIVRAISON_OFFERTE_COLUMN_ID]: false,
}

const FILTRES_MISE_EN_AVANT: DataTableFacetedFilterOption[] = [
  { value: "1", label: "Mis en avant" },
]

const FILTRES_LIVRAISON: DataTableFacetedFilterOption[] = [
  { value: "1", label: "Livraison offerte" },
]

const FILTRES_STOCK: DataTableFacetedFilterOption[] = [
  { value: PRODUIT_STOCK_ZERO, label: "Rupture" },
  { value: PRODUIT_STOCK_NON_NUL, label: "En stock" },
]

function champLot(ids: string[], champs: Record<string, string>): FormData {
  const formData = new FormData()
  formData.set(CHAMP_IDS_LOT, JSON.stringify(ids))
  for (const [cle, valeur] of Object.entries(champs)) {
    formData.set(cle, valeur)
  }
  return formData
}

function DialogueStructure({
  open,
  onOpenChange,
  structures,
  enCours,
  onConfirmer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  structures: StructureDuFiltre[]
  enCours: boolean
  onConfirmer: (structureId: string) => void
}) {
  const [structureChoisie, setStructureChoisie] = React.useState("")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Définir la Structure</DialogTitle>
          <DialogDescription>
            Les Produits sélectionnés rejoindront la Structure choisie.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="structure-lot">Structure d&apos;arrivée</Label>
          <Select
            value={structureChoisie}
            onValueChange={(valeur) => setStructureChoisie(valeur ?? "")}
          >
            <SelectTrigger id="structure-lot" className="w-full">
              <SelectValue placeholder="Choisir une Structure" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {structures.map((structure) => (
                  <SelectItem key={structure.id} value={structure.id}>
                    {structure.chemin}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={structureChoisie === "" || enCours}
            onClick={() => onConfirmer(structureChoisie)}
          >
            Définir la Structure
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogueSuppression({
  open,
  onOpenChange,
  titre,
  description,
  enCours,
  onConfirmer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titre: string
  description: string
  enCours: boolean
  onConfirmer: () => void
}) {
  const annulerRef = React.useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent initialFocus={annulerRef}>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">{titre}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button ref={annulerRef} variant="outline" />}
          >
            Annuler
          </AlertDialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={enCours}
            onClick={onConfirmer}
          >
            Supprimer définitivement
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function ProduitsTable({
  params,
  page,
  structures,
  sansStructureLabel,
  actions,
}: {
  params: ProduitListingParams
  page: AdminProductsPage
  structures: StructureDuFiltre[]
  sansStructureLabel: string
  actions: ProduitsTableActions
}) {
  const router = useRouter()
  const {
    view,
    queryDraft,
    onQueryChange,
    onSortingChange,
    onColumnFiltersChange,
    onPaginationChange,
    reset,
  } = useProduitListing({
    params,
    pageCount: page.pageCount,
    navigation: {
      replace: (href: string) => router.replace(href, { scroll: false }),
    },
  })

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [rapport, setRapport] = React.useState<string | null>(null)
  const [erreur, setErreur] = React.useState<string | null>(null)
  const [enCours, demarrer] = React.useTransition()
  const [structureOuverte, setStructureOuverte] = React.useState(false)
  const [suppressionOuverte, setSuppressionOuverte] = React.useState(false)
  const [produitASupprimer, setProduitASupprimer] =
    React.useState<FaitsProduitListe | null>(null)
  const [selectionASupprimer, setSelectionASupprimer] = React.useState<
    string[] | null
  >(null)

  const executer = React.useCallback(
    (
      action: ProduitLotAction,
      ids: string[],
      champs: Record<string, string> = {},
      viderLaSelection = false
    ) => {
      const formData = champLot(ids, champs)
      demarrer(async () => {
        const resultat = await action({}, formData)
        if (resultat.error) {
          setErreur(resultat.error)
          setRapport(null)
          return
        }
        setErreur(null)
        setRapport(resultat.rapport ? messageDuRapport(resultat.rapport) : null)
        if (viderLaSelection) setRowSelection({})
      })
    },
    [demarrer]
  )

  const idsSelectionnes = Object.keys(rowSelection)

  const columns: ColumnDef<FaitsProduitListe>[] = (() => {
    const actionsDeLigne = (produit: FaitsProduitListe) => (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions pour ${produit.name}`}
              />
            }
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              render={<Link href={`/admin/produits/${produit.id}`} />}
            >
              Modifier
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => executer(actions.duplicate, [produit.id])}
            >
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                executer(actions.setFeatured, [produit.id], {
                  [CHAMP_VALEUR_LOT]: produit.isFeatured ? "0" : "1",
                })
              }
            >
              {produit.isFeatured
                ? "Retirer la mise en avant"
                : "Mettre en avant"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                executer(actions.setFreeShipping, [produit.id], {
                  [CHAMP_VALEUR_LOT]: produit.freeShipping ? "0" : "1",
                })
              }
            >
              {produit.freeShipping
                ? "Retirer la livraison offerte"
                : "Offrir la livraison"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                setProduitASupprimer(produit)
                setSuppressionOuverte(true)
              }}
            >
              <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )

    return [
      {
        id: SELECTION_COLUMN_ID,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Sélectionner tous les Produits de la page"
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onCheckedChange={(coche) =>
              table.toggleAllPageRowsSelected(coche === true)
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Sélectionner ${row.original.name}`}
            checked={row.getIsSelected()}
            onCheckedChange={(coche) => row.toggleSelected(coche === true)}
          />
        ),
      },
      {
        id: NOM_COLUMN_ID,
        accessorFn: (produit) => produit.name,
        meta: { label: "Produit" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Produit" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            {row.original.image ? (
              <Image
                src={row.original.image}
                alt=""
                width={40}
                height={40}
                className="size-10 rounded-lg border object-cover"
              />
            ) : null}
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{row.original.name}</span>
              <span className="truncate text-sm text-muted-foreground">
                {row.original.brand}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: STRUCTURE_COLUMN_ID,
        accessorFn: (produit) => produit.categoryName,
        enableSorting: false,
        meta: { label: "Structure" },
        header: "Structure",
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{row.original.categoryName}</span>
        ),
      },
      {
        id: PRIX_COLUMN_ID,
        accessorFn: (produit) => produit.price,
        meta: { label: "Prix" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Prix" />
        ),
        cell: ({ row }) => (
          <span className="font-medium whitespace-nowrap">
            {formatPrice(row.original.price)}
          </span>
        ),
      },
      {
        id: STOCK_COLUMN_ID,
        accessorFn: (produit) => produit.totalStock,
        meta: { label: "Stock" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Stock" />
        ),
        cell: ({ row }) => (
          <span
            className={
              row.original.totalStock === 0 ? "text-destructive" : undefined
            }
          >
            {row.original.totalStock}
          </span>
        ),
      },
      {
        id: DATE_COLUMN_ID,
        accessorFn: (produit) => produit.createdAt.getTime(),
        meta: { label: "Créée le" },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Créée le" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {dateFormatter.format(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: STATUT_COLUMN_ID,
        accessorFn: (produit) =>
          [
            produit.isFeatured ? "mis-en-avant" : "",
            produit.freeShipping ? "livraison-offerte" : "",
          ]
            .filter(Boolean)
            .join(","),
        enableSorting: false,
        enableHiding: false,
        header: "Statut",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.isFeatured ? <Badge>Mis en avant</Badge> : null}
            {row.original.freeShipping ? (
              <Badge variant="secondary">Livraison offerte</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: MISE_EN_AVANT_COLUMN_ID,
        accessorFn: (produit) => (produit.isFeatured ? "1" : "0"),
        enableSorting: false,
        enableHiding: false,
        header: "Mise en avant",
        cell: () => null,
      },
      {
        id: LIVRAISON_OFFERTE_COLUMN_ID,
        accessorFn: (produit) => (produit.freeShipping ? "1" : "0"),
        enableSorting: false,
        enableHiding: false,
        header: "Livraison offerte",
        cell: () => null,
      },
      {
        id: ACTIONS_COLUMN_ID,
        enableSorting: false,
        enableHiding: false,
        header: () => (
          <div className="flex justify-end pe-1">
            <span className="font-medium whitespace-nowrap">Actions</span>
          </div>
        ),
        cell: ({ row }) => actionsDeLigne(row.original),
      },
    ]
  })()

  const table = useReactTable({
    data: page.produits,
    columns,
    pageCount: page.pageCount,
    state: {
      sorting: [{ id: view.tri, desc: view.sens === "desc" }],
      pagination: { pageIndex: view.pageIndex, pageSize: view.pageSize },
      columnFilters: [
        ...(view.structure !== null
          ? [{ id: STRUCTURE_COLUMN_ID, value: [view.structure] }]
          : []),
        ...(view.misEnAvant
          ? [{ id: MISE_EN_AVANT_COLUMN_ID, value: ["1"] }]
          : []),
        ...(view.livraisonOfferte
          ? [{ id: LIVRAISON_OFFERTE_COLUMN_ID, value: ["1"] }]
          : []),
        ...(view.stock !== null
          ? [{ id: STOCK_COLUMN_ID, value: [view.stock] }]
          : []),
      ],
      globalFilter: queryDraft,
      rowSelection,
      columnVisibility: COLONNES_CACHEES,
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange,
    onPaginationChange,
    onColumnFiltersChange,
    onGlobalFilterChange: onQueryChange,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    getRowId: (produit) => produit.id,
    getCoreRowModel: getCoreRowModel(),
  })

  const hasActiveCriteria =
    view.q.trim().length > 0 ||
    view.structure !== null ||
    view.misEnAvant ||
    view.livraisonOfferte ||
    view.stock !== null

  const structureOptions: DataTableFacetedFilterOption[] = structures.map(
    (structure) => ({ value: structure.id, label: structure.chemin })
  )
  structureOptions.push({
    value: PRODUIT_STRUCTURE_SANS,
    label: sansStructureLabel,
  })

  return (
    <div className="flex flex-col gap-4">
      {erreur ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      <DataTableToolbar
        table={table}
        searchLabel="Rechercher un Produit par nom, marque, slug ou SKU"
        searchPlaceholder="Rechercher un Produit…"
        resultCount={page.totalCount}
        statusLabels={{ singulier: "produit", pluriel: "produits" }}
        filters={[
          {
            columnId: STRUCTURE_COLUMN_ID,
            title: "Structure",
            options: structureOptions,
          },
          {
            columnId: MISE_EN_AVANT_COLUMN_ID,
            title: "Mise en avant",
            options: FILTRES_MISE_EN_AVANT,
          },
          {
            columnId: LIVRAISON_OFFERTE_COLUMN_ID,
            title: "Livraison offerte",
            options: FILTRES_LIVRAISON,
          },
          {
            columnId: STOCK_COLUMN_ID,
            title: "Stock",
            options: FILTRES_STOCK,
          },
        ]}
      />

      {idsSelectionnes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {idsSelectionnes.length} produit
            {idsSelectionnes.length > 1 ? "s" : ""} sélectionné
            {idsSelectionnes.length > 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={enCours}
            onClick={() =>
              executer(
                actions.setFeatured,
                idsSelectionnes,
                {
                  [CHAMP_VALEUR_LOT]: "1",
                },
                true
              )
            }
          >
            Mettre en avant
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={enCours}
            onClick={() =>
              executer(
                actions.setFreeShipping,
                idsSelectionnes,
                {
                  [CHAMP_VALEUR_LOT]: "1",
                },
                true
              )
            }
          >
            Livraison offerte
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={enCours}
            onClick={() => setStructureOuverte(true)}
          >
            Définir la Structure
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={enCours}
            onClick={() => {
              setSelectionASupprimer(idsSelectionnes)
              setSuppressionOuverte(true)
            }}
          >
            Supprimer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => table.resetRowSelection()}
          >
            Tout désélectionner
          </Button>
        </div>
      ) : null}

      {page.produits.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="size-5 text-muted-foreground"
            />
          </div>
          <p className="text-sm font-medium">
            {hasActiveCriteria
              ? "Aucun Produit ne correspond à ces critères."
              : "Aucun Produit pour le moment."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveCriteria
              ? "Ajustez la recherche ou les filtres pour élargir la liste."
              : "Les nouveaux Produits apparaîtront ici."}
          </p>
          {hasActiveCriteria ? (
            <Button variant="outline" className="mt-4" onClick={reset}>
              Réinitialiser les filtres
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataTablePagination table={table} />
        </>
      )}

      <DialogueStructure
        open={structureOuverte}
        onOpenChange={setStructureOuverte}
        structures={structures}
        enCours={enCours}
        onConfirmer={(structureId) => {
          setStructureOuverte(false)
          executer(
            actions.setStructure,
            idsSelectionnes,
            {
              [CHAMP_STRUCTURE_LOT]: structureId,
            },
            true
          )
        }}
      />

      <DialogueSuppression
        open={suppressionOuverte && produitASupprimer !== null}
        onOpenChange={(open) => {
          setSuppressionOuverte(open)
          if (!open) setProduitASupprimer(null)
        }}
        titre={`Supprimer « ${produitASupprimer?.name ?? ""} »`}
        description="Cette action est définitive : le Produit et ses Variantes seront supprimés du Catalogue."
        enCours={enCours}
        onConfirmer={() => {
          const produit = produitASupprimer
          setSuppressionOuverte(false)
          setProduitASupprimer(null)
          if (produit !== null) executer(actions.delete, [produit.id])
        }}
      />

      <DialogueSuppression
        open={suppressionOuverte && selectionASupprimer !== null}
        onOpenChange={(open) => {
          setSuppressionOuverte(open)
          if (!open) setSelectionASupprimer(null)
        }}
        titre={`Supprimer ${selectionASupprimer?.length ?? 0} produit${
          (selectionASupprimer?.length ?? 0) > 1 ? "s" : ""
        }`}
        description="Cette action est définitive : les Produits sélectionnés et leurs Variantes seront supprimés du Catalogue."
        enCours={enCours}
        onConfirmer={() => {
          const ids = selectionASupprimer
          setSuppressionOuverte(false)
          setSelectionASupprimer(null)
          if (ids !== null) executer(actions.delete, ids, {}, true)
        }}
      />

      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {rapport ?? ""}
      </p>
    </div>
  )
}

export function ProduitsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-full max-w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
