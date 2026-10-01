import { DashboardHomeClient } from "@/app/dashboard/dashboard-home-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default function DashboardPage() {
  return <DashboardHomeClient />;
}
