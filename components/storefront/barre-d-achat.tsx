"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function BarreDAchat({
  visible,
  prix,
  onAjouter,
}: {
  visible: boolean
  prix: string
  onAjouter: () => void
}) {
  return (
    <div
      data-slot="barre-d-achat"
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/75 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-6 lg:hidden",
        !visible && "pointer-events-none opacity-0"
      )}
    >
      <div className="mx-auto flex w-full max-w-[980px] items-center justify-between gap-4">
        <p className="text-[28px] font-semibold">{prix}</p>
        <Button size="xl" onClick={onAjouter} className="rounded-full text-[17px]">
          Ajouter au panier
        </Button>
      </div>
    </div>
  )
}
