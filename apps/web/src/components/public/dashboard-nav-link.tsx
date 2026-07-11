"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type DashboardNavLinkProps = {
  className?: string;
  linkClassName?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  label?: string;
};

export function DashboardNavLink({
  className,
  linkClassName,
  variant = "ghost",
  size = "sm",
  label = "Dashboard",
}: DashboardNavLinkProps) {
  const { data: session } = authClient.useSession();
  if (!session) return null;

  return (
    <Button asChild variant={variant} size={size} className={cn(className)}>
      <Link href="/dashboard" className={linkClassName}>
        {label}
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
