import type { Metadata } from "next"

export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="flex w-full flex-col items-center gap-6">{children}</div>
    </main>
  )
}
