import { TimecardsPageClient } from "@/components/timecards/timecards-page-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crew timecards",
};

export default function TimecardsPage() {
  return <TimecardsPageClient />;
}
