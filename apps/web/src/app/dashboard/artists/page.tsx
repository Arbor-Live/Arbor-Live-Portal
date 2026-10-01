import { ArtistsPageContent } from "@/components/bands/artists-page-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Artists",
};

export default function BandsAndPerformersPage() {
  return <ArtistsPageContent />;
}
