import Link from "next/link";

const buckets = [
  { id: "lighting", label: "Lighting" },
  { id: "sound", label: "Sound" },
  { id: "environmental", label: "Environmental" },
  { id: "staging", label: "Staging" },
  { id: "misc", label: "Misc" },
] as const;

export function PublicSiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Arbor Live
            </Link>
            <p className="text-xs text-muted-foreground">Public equipment reference</p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            <Link className="rounded-md border px-3 py-1 hover:bg-muted" href="/public/packages">
              Packages
            </Link>
            <Link className="rounded-md border px-3 py-1 hover:bg-muted" href="/public/types">
              Types
            </Link>
            <Link className="rounded-md border px-3 py-1 hover:bg-muted" href="/public/request">
              Request booking
            </Link>
            <Link className="rounded-md border px-3 py-1 hover:bg-muted" href="/sign-in">
              Staff sign-in
            </Link>
          </nav>
        </div>
        <div className="border-t bg-muted/30">
          <div className="mx-auto flex max-w-5xl flex-wrap gap-2 px-4 py-2 text-xs">
            {buckets.map((bucket) => (
              <div key={bucket.id} className="flex flex-wrap gap-2">
                <Link
                  className="rounded-md bg-background px-2 py-1 hover:bg-muted"
                  href={`/public/packages/${bucket.id}`}
                >
                  Packages · {bucket.label}
                </Link>
                <Link
                  className="rounded-md bg-background px-2 py-1 hover:bg-muted"
                  href={`/public/types/${bucket.id}`}
                >
                  Types · {bucket.label}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
