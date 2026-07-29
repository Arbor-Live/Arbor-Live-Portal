"use client";

import { AdminBandSelectionProvider } from "@/components/bands/admin-band-selection";

export default function BandsAndPerformersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminBandSelectionProvider>{children}</AdminBandSelectionProvider>;
}
