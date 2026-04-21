import Link from "next/link";
import { isAuthenticated } from "@/lib/auth-server";

export default async function Home() {
  const authed = await isAuthenticated();

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Arbor Live Portal</h1>
        <p className="text-sm text-muted-foreground">
          Staff use the dashboard. These pages are public reference views for equipment, packages, and Lost &amp; Found.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted" href="/public/packages">
          Browse packages
        </Link>
        <Link className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted" href="/public/types">
          Browse model types
        </Link>
        <Link className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted" href="/sign-in">
          Staff sign-in
        </Link>
        <Link className="rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted" href="/dashboard">
          {authed ? "Open dashboard" : "Dashboard (requires sign-in)"}
        </Link>
      </div>
    </div>
  );
}
