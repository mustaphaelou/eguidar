"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { HugeiconsIcon } from "@hugeicons/react"
import { ExternalLinkIcon } from "@hugeicons/core-free-icons"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { NavSection } from "@/components/layout/admin/data/sidebar-data"

export function NavGroup({ section }: { section: NavSection }) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarGroup>
      {section.title ? (
        <SidebarGroupLabel className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {section.title}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map((item) => {
            const isActive =
              item.url === "/admin"
                ? pathname === "/admin"
                : pathname === item.url || pathname.startsWith(`${item.url}/`)

            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  isActive={isActive}
                  tooltip={item.title}
                  className="relative h-9 rounded-lg"
                  render={
                    item.isExternal ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    ) : (
                      <Link href={item.url} />
                    )
                  }
                  onClick={() => {
                    if (isMobile) setOpenMobile(false)
                  }}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-primary"
                    />
                  ) : null}
                  {item.icon ? (
                    <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                  ) : null}
                  <span>{item.title}</span>
                  {item.isExternal ? (
                    <HugeiconsIcon
                      icon={ExternalLinkIcon}
                      strokeWidth={2}
                      className="ms-auto size-3.5 text-muted-foreground"
                    />
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
