"use client"

import Link from "next/link"

import { brand, site } from "@/lib/site"

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
              <img
                src={brand.siteIcon.src}
                alt=""
                width={32}
                height={32}
                className="size-8 shrink-0"
              />
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
