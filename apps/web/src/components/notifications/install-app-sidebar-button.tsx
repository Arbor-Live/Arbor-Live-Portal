"use client";

import { useQuery } from "convex/react";
import { DeviceMobileIcon } from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { api } from "@/lib/convex-api";
import { useIsMobileDevice, useIsStandalone } from "@/hooks/use-pwa";
import { useInstallPrompt } from "./install-prompt-store";

/** Phone-browser-only sidebar entry, shown until the user opens the Home Screen app. */
export function InstallAppSidebarButton() {
  const mobile = useIsMobileDevice();
  const standalone = useIsStandalone();
  const install = useQuery(api.appInstall.getAppInstallState, {});
  const { openDialog } = useInstallPrompt();

  if (!mobile || standalone || !install || install.installed) return null;
  return (
    <SidebarGroup className="pb-0">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" onClick={openDialog}>
              <DeviceMobileIcon />
              <span>Add to Home Screen</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
