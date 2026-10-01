import { OpenPositionsBoard } from "@/components/events/open-positions-board";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Open positions",
};

export default function OpenPositionsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="Open positions"
        description="Positions on upcoming bills that no act fills yet, soonest first. Fill one to open it on the event's Lineup."
      />
      <ArborOnlyGuard>
        <OpenPositionsBoard />
      </ArborOnlyGuard>
    </div>
  );
}
