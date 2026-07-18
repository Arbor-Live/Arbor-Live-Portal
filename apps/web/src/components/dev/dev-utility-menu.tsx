"use client";

import Link from "next/link";
import { WrenchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DEV_PREVIEW = "devPreview=1";

const LINKS = [
  { href: `/setup?${DEV_PREVIEW}`, label: "First-admin setup" },
  { href: `/onboarding?${DEV_PREVIEW}`, label: "Crew onboarding" },
  { href: `/onboarding/band?${DEV_PREVIEW}`, label: "Band onboarding" },
] as const;

/**
 * Floating menu (development only) to jump into onboarding wizards with
 * `?devPreview=1`, which skips completion / availability redirects.
 *
 * Gated on `NODE_ENV === "development"` — never renders in production builds.
 * See docs/getting-started.md ("Dev preview wizards").
 */
export function DevUtilityMenu() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-2 border border-border/80 shadow-md"
          >
            <WrenchIcon className="size-4" weight="bold" />
            Dev
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Open wizards</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LINKS.map((link) => (
            <DropdownMenuItem key={link.href} asChild>
              <Link href={link.href}>{link.label}</Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            Opens with <code className="text-[10px]">?devPreview=1</code>. Skips
            redirects; walk-through is UI-only when you lack that role&apos;s
            onboarding row. Sign in required for crew/band routes.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
