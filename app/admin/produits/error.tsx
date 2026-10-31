"use client"

import { Button } from "@/components/ui/button"

export default function ProduitsError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-6">
      <h2 className="text-lg font-semibold">
        La liste des Produits est indisponible
      </h2>
      <p className="text-sm text-muted-foreground">
        {error.message || "La lecture du Catalogue a échoué."}
      </p>
      <div>
        <Button type="button" variant="outline" onClick={() => retry()}>
          Réessayer
        </Button>
      </div>
    </div>
  )
}
