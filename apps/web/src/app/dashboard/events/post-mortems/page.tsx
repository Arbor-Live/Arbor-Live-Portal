import { MyPostMortemsClient } from "@/components/events/my-post-mortems-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";

export default function MyPostMortemsPage() {
  return (
    <ArborOnlyGuard>
      <MyPostMortemsClient />
    </ArborOnlyGuard>
  );
}
