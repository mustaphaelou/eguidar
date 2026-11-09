/**
 * Le squelette du Tableau de bord, partagé par le `loading.tsx` de la route et
 * la frontière Suspense de la page. La pulsation est un mouvement : elle
 * s'éteint sous `prefers-reduced-motion: reduce`.
 */
export function TableauDeBordChargement() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-52 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_valeur, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-7">
        <div className="h-80 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none lg:col-span-4" />
        <div className="h-80 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none lg:col-span-3" />
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
    </div>
  )
}
