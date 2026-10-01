import { MyPostEventWorkClient } from "@/components/events/my-post-event-work-client";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My post-event work",
};

export default function MyPostEventWorkPage() {
  return (
    <ArborOnlyGuard>
      <MyPostEventWorkClient />
    </ArborOnlyGuard>
  );
}
