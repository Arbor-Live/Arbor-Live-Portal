import { WorkPostsManager } from "@/components/marketing/work-posts-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Work & stories",
};

export default function MarketingWorkPage() {
  return <WorkPostsManager />;
}
