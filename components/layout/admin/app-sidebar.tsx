"use client"

import Link from "next/link"

import { site } from "@/lib/site"

import { NavGroup } from "@/components/layout/admin/nav-group"
import { UserMenu } from "@/components/layout/admin/user-menu"
import {
  boutiqueSection,
  navSections,
} from "@/components/layout/admin/data/sidebar-data"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({
  userName,
  userEmail,
}: {
  userName: string
  userEmail: string
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={`${site.legalName} — Administration`}
              render={<Link href="/admin" />}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary font-heading text-base font-semibold text-primary-foreground">
                {site.legalName.slice(0, 1)}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="font-semibold">{site.legalName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Administration
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {[...navSections, boutiqueSection].map((section, index) => (
          <NavGroup
            key={section.title ?? `section-${index}`}
            section={section}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu userName={userName} userEmail={userEmail} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
