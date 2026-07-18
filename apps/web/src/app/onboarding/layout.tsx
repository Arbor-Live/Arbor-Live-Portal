import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAuthenticated();
  if (!authed) {
    redirect("/sign-in?redirect=/onboarding");
  }

  return <div className="min-h-dvh bg-background">{children}</div>;
}
