"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" forcedTheme="light" {...props}>
      {children}
    </NextThemesProvider>
  )
}

export { ThemeProvider }
