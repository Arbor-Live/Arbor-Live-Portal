import { TimecardsClient } from "@/components/timecards/timecards-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My timecards",
};

export default function MyTimecardsPage() {
  return <TimecardsClient />;
}
