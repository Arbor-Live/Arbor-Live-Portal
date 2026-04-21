import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function BandsAndPerformersPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bands and Performers</CardTitle>
          <CardDescription>
            Track rosters, bookings, and profile details for talent.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Bands</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">Coming soon.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performers</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">Coming soon.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contracts</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">Coming soon.</CardContent>
        </Card>
      </div>
    </div>
  );
}
