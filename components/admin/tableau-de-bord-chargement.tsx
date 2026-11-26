import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function TableauDeBordChargement() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-52 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-4 w-80 max-w-full rounded-full motion-reduce:animate-none" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_valeur, index) => (
          <Card key={index} size="sm" className="border border-border/60">
            <CardHeader>
              <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-7 w-32 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-40 motion-reduce:animate-none" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="border border-border/60 lg:col-span-7">
          <CardHeader>
            <Skeleton className="h-5 w-48 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-72 max-w-full motion-reduce:animate-none" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full motion-reduce:animate-none" />
          </CardContent>
        </Card>
        <Card className="border border-border/60 lg:col-span-5">
          <CardHeader>
            <Skeleton className="h-5 w-40 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-56 max-w-full motion-reduce:animate-none" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_valeur, index) => (
              <Skeleton
                key={index}
                className="h-10 w-full motion-reduce:animate-none"
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border border-border/60">
        <CardHeader>
          <Skeleton className="h-5 w-32 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-64 max-w-full motion-reduce:animate-none" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full motion-reduce:animate-none" />
          <Skeleton className="h-12 w-full motion-reduce:animate-none" />
        </CardContent>
      </Card>
    </div>
  )
}
