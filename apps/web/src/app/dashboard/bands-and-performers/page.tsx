import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BandOnlyGuard } from "@/components/org-context-guard";
import { BandSelfServiceClient } from "@/components/bands/band-self-service-client";

export default function BandsAndPerformersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bands and Performers</CardTitle>
          <CardDescription>
            Band organizations can manage their public profile and team access. Payments live under
            the Payments subtab.
          </CardDescription>
        </CardHeader>
      </Card>
      <BandOnlyGuard>
        <BandSelfServiceClient />
      </BandOnlyGuard>
    </div>
  );
}
