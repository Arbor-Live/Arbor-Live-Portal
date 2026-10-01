import { RidersPageContent } from "@/components/riders/riders-page-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Technical rider",
};

export default function BandRidersPage() {
  return <RidersPageContent />;
}
