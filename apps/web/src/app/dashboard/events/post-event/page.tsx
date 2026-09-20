import { MyPostEventWorkClient } from "@/components/events/my-post-event-work-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function MyPostEventWorkPage() {
  return (
    <ArborOnlyGuard>
      <MyPostEventWorkClient />
    </ArborOnlyGuard>
  );
}
