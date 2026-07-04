import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BandMediaClient } from "@/components/bands/band-media-client";

export default function BandMediaPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
          <CardDescription>
            Photos and videos for your band and linked events.
          </CardDescription>
        </CardHeader>
      </Card>
      <BandMediaClient />
    </div>
  );
}
