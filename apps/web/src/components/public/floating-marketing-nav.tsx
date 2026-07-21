"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ListIcon } from "@phosphor-icons/react";
import { useLandingMotion } from "@/components/landing/landing-motion";
import { Button } from "@/components/ui/button";
import { DashboardNavLink } from "@/components/public/dashboard-nav-link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { landingNavLinks } from "@/lib/landing-content";
import { cn } from "@/lib/utils";

const GLOW_EASE = 0.14;

export function FloatingMarketingNav() {
  const { reduceMotion } = useLandingMotion();
  const shellRef = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const shell = shellRef.current;
    if (!shell) return;

    let raf = 0;
    const current = { x: 50, y: 0 };
    const target = { x: 50, y: 0 };

    const onPointerMove = (event: PointerEvent) => {
      const rect = shell.getBoundingClientRect();
      const width = rect.width || 1;
      const height = rect.height || 1;
      target.x = ((event.clientX - rect.left) / width) * 100;
      target.y = ((event.clientY - rect.top) / height) * 100;
      if (!raf) {
        raf = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      raf = 0;
      current.x += (target.x - current.x) * GLOW_EASE;
      current.y += (target.y - current.y) * GLOW_EASE;
      shell.style.setProperty("--glow-x", `${current.x}%`);
      shell.style.setProperty("--glow-y", `${current.y}%`);
      if (Math.abs(target.x - current.x) > 0.05 || Math.abs(target.y - current.y) > 0.05) {
        raf = requestAnimationFrame(tick);
      }
    };

    shell.style.setProperty("--glow-x", "50%");
    shell.style.setProperty("--glow-y", "0%");
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [reduceMotion]);

  return (
    // Avoid pointer-events-none on this shell: Radix Sheet portals from here, and
    // iOS Safari often drops taps on dialog content nested under pointer-events-none.
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center p-3 sm:p-4">
      <div
        ref={shellRef}
        className={cn(
          "relative w-full max-w-6xl p-px shadow-[0_8px_28px_rgba(0,0,0,0.12)]",
          reduceMotion ? "bg-border/60" : "marketing-nav-glow",
        )}
      >
        <div className="flex items-center justify-between gap-3 bg-background/95 px-4 py-2.5 sm:gap-4 sm:bg-background/70 sm:px-5 sm:py-3 sm:backdrop-blur-xl">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Arbor Live"
              width={1014}
              height={463}
              className="h-7 w-auto brightness-0 dark:invert sm:h-8"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {landingNavLinks.map((link) => (
              <Button key={link.label} asChild variant="ghost" size="sm">
                <Link
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener noreferrer" : undefined}
                >
                  {link.label}
                </Link>
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <DashboardNavLink className="hidden sm:inline-flex" />
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/request">Book us</Link>
            </Button>

            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="Open menu"
                >
                  <ListIcon className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="z-[60] w-[min(100%,20rem)] gap-0 p-0 pointer-events-auto"
              >
                <SheetHeader className="border-b px-5 py-4 text-left">
                  <SheetTitle className="font-heading text-base">Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 p-3">
                  {landingNavLinks.map((link) => (
                    <Button key={link.label} asChild variant="ghost" className="justify-start">
                      <Link
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        onClick={() => setMobileOpen(false)}
                      >
                        {link.label}
                      </Link>
                    </Button>
                  ))}
                  <DashboardNavLink
                    className="justify-start sm:hidden"
                    linkClassName="w-full justify-start"
                  />
                  <div className="mt-2 border-t pt-3">
                    <Button asChild className="w-full">
                      <Link href="/request" onClick={() => setMobileOpen(false)}>
                        Book us
                      </Link>
                    </Button>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
