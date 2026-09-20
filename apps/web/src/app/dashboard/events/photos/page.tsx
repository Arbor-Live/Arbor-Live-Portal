import { MyEventPhotosClient } from "@/components/events/my-event-photos-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function MyEventPhotosPage() {
  return (
    <ArborOnlyGuard>
      <MyEventPhotosClient />
    </ArborOnlyGuard>
  );
}
