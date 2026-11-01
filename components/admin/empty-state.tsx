import { cn } from "@/lib/utils"

/**
 * L'état vide d'une Liste ou d'une Bibliothèque. Il dit ce qui manque, puis
 * propose le geste qui le fait exister — jamais un simple paragraphe gris.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center",
        className
      )}
    >
      {icon ? (
        <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-balance">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
