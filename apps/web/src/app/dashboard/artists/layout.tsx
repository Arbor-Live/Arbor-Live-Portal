"use client";

import { AdminBandSelectionProvider } from "@/components/bands/admin-band-selection";
import { ArtistWorkspaceShell } from "@/components/bands/artist-workspace";

export default function BandsAndPerformersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminBandSelectionProvider>
      <ArtistWorkspaceShell>{children}</ArtistWorkspaceShell>
    </AdminBandSelectionProvider>
  );
}
