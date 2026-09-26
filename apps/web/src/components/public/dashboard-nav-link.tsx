"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type SessionNavLinkProps = {
  className?: string;
  linkClassName?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  onNavigate?: () => void;
};

type DashboardNavLinkProps = SessionNavLinkProps & {
  label?: string;
};

export function DashboardNavLink({
  className,
  linkClassName,
  variant = "ghost",
  size = "sm",
  label = "Dashboard",
  onNavigate,
}: DashboardNavLinkProps) {
  const { data: session } = authClient.useSession();
  if (!session) return null;

  return (
    <Button asChild variant={variant} size={size} className={cn(className)}>
      <Link href="/dashboard" className={linkClassName} onClick={onNavigate}>
        {label}
      </Link>
    </Button>
  );
}

/** Visible only while signed out. Hidden during session load so a signed-in
 *  visitor does not flash a Sign in control. */
export function SignInNavLink({
  className,
  linkClassName,
  variant = "outline",
  size = "sm",
  onNavigate,
}: SessionNavLinkProps) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending || session) return null;

  return (
    <Button asChild variant={variant} size={size} className={cn(className)}>
      <Link href="/sign-in" className={linkClassName} onClick={onNavigate}>
        Sign in
      </Link>
    </Button>
  );
}

export function DashboardFooterLink({ className }: { className?: string }) {
  const { data: session } = authClient.useSession();
  if (!session) return null;

  return (
    <li>
      <Link href="/dashboard" className={cn("hover:text-white hover:underline", className)}>
        Open dashboard
      </Link>
    </li>
  );
}
