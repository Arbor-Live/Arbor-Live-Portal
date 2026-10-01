import { BandMediaClient } from "@/components/bands/band-media-client";
import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media",
};

export default function BandMediaPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Media"
        description="Photos and videos for your artist profile and linked events."
      />
      <BandMediaClient />
    </div>
  );
}
