import { Suspense } from "react";
import { ArtistDirectory } from "@/components/events/artist-directory";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "Artist directory",
};

export default function ArtistDirectoryPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/dashboard/events", label: "Events" }}
        title="Artist directory"
        description="Every artist we work with and who to reach, including acts that aren't on the public page. Search a name or phone number from a group chat to see whose it is."
      />
      <ArborOnlyGuard>
        <Suspense>
          <ArtistDirectory />
        </Suspense>
      </ArborOnlyGuard>
    </div>
  );
}
