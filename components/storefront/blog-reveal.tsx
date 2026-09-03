"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Révélation au défilement façon Newsroom : fondu + remontée en
 * 0,8s cubic-bezier(.4,0,.25,1), montée paresseuse via IntersectionObserver.
 * Désactivée sous prefers-reduced-motion (apparition immédiate, sans transition).
 */
export function BlogReveal({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-[0.8s] ease-[cubic-bezier(.4,0,.25,1)] motion-reduce:transition-none",
        visible
          ? "scale-100 opacity-100 motion-reduce:scale-100 motion-reduce:opacity-100"
          : "translate-y-4 scale-[0.99] opacity-0 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100",
        className
      )}
    >
      {children}
    </div>
  )
}
