"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard/events", label: "Events" },
  { href: "/dashboard/financial-hub", label: "Financial Hub" },
  { href: "/dashboard/users", label: "Users" },
  { href: "/dashboard/bands-and-performers", label: "Bands and Performers" },
  { href: "/dashboard/inventory", label: "Inventory" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-2">
      {links.map((link) => (
        <Button
          key={link.href}
          asChild
          variant={pathname === link.href ? "default" : "ghost"}
          className="justify-start"
        >
          <Link href={link.href}>{link.label}</Link>
        </Button>
      ))}
    </nav>
  );
}
