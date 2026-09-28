import { OpenPositionsBoard } from "@/components/events/open-positions-board";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export const metadata = {
  title: "Open positions | Arbor Live",
};

export default function OpenPositionsPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Open positions</h1>
        <p className="text-sm text-muted-foreground">
          Positions on upcoming bills that no act fills yet, soonest first. Fill one to open it on
          the event&apos;s Lineup.
        </p>
      </header>
      <ArborOnlyGuard>
        <OpenPositionsBoard />
      </ArborOnlyGuard>
    </div>
  );
}
