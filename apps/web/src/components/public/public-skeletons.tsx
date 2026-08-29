import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Dark marketing hero placeholder (artist detail, etc.). */
export function PublicHeroSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden border-b bg-zinc-950 px-4 py-16 sm:px-6 sm:py-24 lg:px-8",
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      <div className="relative mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-4 w-28 bg-zinc-800" />
        <Skeleton className="h-10 w-2/3 max-w-md bg-zinc-800 sm:h-12" />
        <Skeleton className="h-5 w-full max-w-xl bg-zinc-800" />
        <Skeleton className="h-5 w-4/5 max-w-lg bg-zinc-800" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Standard page hero + body cards for quote / request trackers. */
export function PublicPortalPageSkeleton({
  titleWidth = "w-64",
}: {
  titleWidth?: string;
}) {
  return (
    <div role="status" aria-label="Loading">
      <div className="relative overflow-hidden border-b bg-muted/40 px-4 pt-24 pb-14 sm:px-6 sm:pt-28 sm:pb-20 lg:px-8 dark:bg-zinc-950">
        <div className="relative mx-auto max-w-6xl space-y-4">
          <Skeleton className={cn("h-10 sm:h-12", titleWidth)} />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-5 w-3/5 max-w-md" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-12 sm:px-6 lg:px-8">
        <Card className="border-border/50 shadow-sm ring-0">
          <CardHeader className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/50 shadow-sm ring-0">
            <CardHeader>
              <Skeleton className="h-5 w-36" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
          <Card className="border-border/50 shadow-sm ring-0">
            <CardHeader>
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function PublicCardGridSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, index) => (
        <Card
          key={index}
          className="h-full gap-0 overflow-hidden border border-border py-0 shadow-sm ring-0"
        >
          <Skeleton className="aspect-[4/5] w-full rounded-none" />
          <CardContent className="space-y-2 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function PublicEquipmentSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6 lg:px-8"
      role="status"
      aria-label="Loading equipment"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="space-y-4">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex flex-wrap gap-2 pt-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
      </div>
      <Card className="border-border/50 shadow-sm ring-0">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </CardContent>
      </Card>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function PublicArticleSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <PublicHeroSkeleton />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex flex-wrap gap-2 pt-4">
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-14" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
