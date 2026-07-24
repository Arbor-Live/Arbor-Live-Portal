import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { OnboardingBanner } from "@/components/onboarding/onboarding-banner";
import { SessionShellProvider } from "@/components/session-shell-provider";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { isAuthenticated } from "@/lib/auth-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAuthenticated();
  if (!authed) {
    redirect("/sign-in");
  }

  return (
    <SessionShellProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <p className="font-medium">Dashboard</p>
          </header>
          <OnboardingBanner />
          <main className="flex-1 p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </SessionShellProvider>
  );
}
