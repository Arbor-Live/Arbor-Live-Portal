import { OpenPositionsBoard } from "@/components/events/open-positions-board";
import { ArborOnlyGuard, OperationsOrAdminGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Open positions",
};

export default function OpenPositionsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Open positions"
        description="Positions on upcoming bills that no act fills yet, soonest first. Track who you've asked with Outreach, or fill one on the event's Lineup."
      />
      <ArborOnlyGuard>
        <OperationsOrAdminGuard>
          <OpenPositionsBoard />
        </OperationsOrAdminGuard>
      </ArborOnlyGuard>
    </div>
  );
}
