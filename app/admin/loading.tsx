export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-52 animate-pulse rounded-full bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_valeur, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
    </div>
  )
}
