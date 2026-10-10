"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import type { InvoiceDraftLines } from "./invoice-draft-model";

export function useInvoiceDraftData({
  invoiceId,
  activeInvoiceId,
  groupId,
  lines,
}: {
  invoiceId?: Id<"invoices">;
  activeInvoiceId?: Id<"invoices">;
  groupId: string;
  lines: InvoiceDraftLines;
}) {
  const managerList = useQuery(api.invoices.listManagers, {});
  const groups = useQuery(api.invoiceGroups.list, { activeOnly: true });
  const settings = useQuery(api.invoiceSettings.get, {});
  const invoiceData = useQuery(api.invoices.get, invoiceId ? { id: invoiceId } : "skip");
  const contacts = useQuery(api.invoiceContacts.list, {
    activeOnly: true,
    ...(groupId ? { groupId: groupId as Id<"invoiceGroups"> } : {}),
  });
  const linkedEvent = useQuery(
    api.events.getByInvoiceId,
    activeInvoiceId ? { invoiceId: activeInvoiceId } : "skip",
  );
  const linkedSeries = invoiceData?.series ?? linkedEvent?.series ?? null;
  const linkedDayEvents = useMemo(() => linkedEvent?.linkedEvents ?? [], [linkedEvent?.linkedEvents]);
  const seriesCostData = useQuery(
    api.eventSeries.get,
    linkedSeries?.seriesId ? { id: linkedSeries.seriesId } : "skip",
  );
  const pullListSyncStatus = useQuery(
    api.eventPullLists.getInvoiceSyncStatus,
    linkedEvent && !linkedSeries ? { eventId: linkedEvent._id } : "skip",
  );
  const bandsForArtists = useQuery(api.users.listBandsForInvoiceLines, {});
  const eventPerformers = useQuery(
    api.eventBands.listPerformersForEvents,
    linkedEvent && !linkedSeries ? { eventIds: linkedDayEvents.map((day) => day._id) } : "skip",
  );

  const createDraft = useMutation(api.invoices.createDraft);
  const updateDraft = useMutation(api.invoices.updateDraft);
  const scaffoldPullListFromInvoice = useMutation(api.eventPullLists.scaffoldFromInvoice);

  const selectedPackageIds = useMemo(
    () => lines.equipmentPackages.map((row) => row.refId).filter(Boolean) as Id<"inventoryPackages">[],
    [lines.equipmentPackages],
  );
  const selectedTypeIds = useMemo(
    () => lines.equipmentTypes.map((row) => row.refId).filter(Boolean) as Id<"inventoryTypes">[],
    [lines.equipmentTypes],
  );
  const packages = useQuery(
    api.inventoryPackages.getOptionsByIds,
    selectedPackageIds.length ? { ids: selectedPackageIds } : "skip",
  );
  const types = useQuery(
    api.inventoryTypes.getOptionsByIds,
    selectedTypeIds.length ? { ids: selectedTypeIds } : "skip",
  );
  const packageById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof packages>[number]>();
    for (const pkg of packages ?? []) map.set(pkg._id, pkg);
    return map;
  }, [packages]);
  const typeById = useMemo(() => {
    const map = new Map<string, NonNullable<typeof types>[number]>();
    for (const type of types ?? []) map.set(type._id, type);
    return map;
  }, [types]);

  return {
    managerList,
    groups,
    settings,
    invoiceData,
    contacts,
    linkedEvent,
    linkedSeries,
    linkedDayEvents,
    seriesCostData,
    pullListSyncStatus,
    bandsForArtists,
    eventPerformers,
    createDraft,
    updateDraft,
    scaffoldPullListFromInvoice,
    packages,
    types,
    packageById,
    typeById,
  };
}
