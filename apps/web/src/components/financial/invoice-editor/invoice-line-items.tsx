"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  CaretDownIcon,
  ClockIcon,
  CurrencyDollarIcon,
  MicrophoneStageIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  TruckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatUsd } from "@/lib/format";
import { ArtistLines, defaultArtistDayId } from "./artist-lines";
import { CrewLines, HoursLines, emptyCrewRow, hasLinkedCrewSchedule } from "./crew-lines";
import { EquipmentLines } from "./equipment-lines";
import { emptyArtistRow } from "./invoice-draft-model";
import { plural } from "./line-items-layout";
import { FeeLines, RentalLines } from "./rental-and-fee-lines";
import type { InvoiceDraft } from "./use-invoice-draft";

/**
 * Every line on the quote in one table, grouped by section (equipment,
 * rentals, artists, crew, extra hours, fees) with a subtotal per group. One
 * Add menu adds a line to any section.
 */
export function InvoiceLineItems({ draft }: { draft: InvoiceDraft }) {
  const [feesCatalogEnabled, setFeesCatalogEnabled] = useState(false);
  const { lines, setSection } = draft;
  const feeDefinitions = useQuery(
    api.invoiceFeeDefinitions.list,
    feesCatalogEnabled || lines.fees.some((row) => row.feeDefinitionId) ? { activeOnly: true } : "skip",
  );

  const linkedCrew = hasLinkedCrewSchedule(draft);
  const lineCount =
    lines.equipmentPackages.length +
    lines.equipmentTypes.length +
    lines.externalRentals.length +
    lines.artists.length +
    lines.crewRows.length +
    lines.fees.length;
  const isEmpty = lineCount === 0 && !linkedCrew;

  const addItems = [
    {
      label: "Package",
      icon: PackageIcon,
      add: () =>
        setSection("equipmentPackages", (rows) => [
          ...rows,
          { refId: "", quantity: "1", basis: draft.defaultEquipmentBasis, excludedTypeIds: [] },
        ]),
    },
    {
      label: "Equipment item",
      icon: PackageIcon,
      add: () =>
        setSection("equipmentTypes", (rows) => [
          ...rows,
          { refId: "", quantity: "1", basis: draft.defaultEquipmentBasis },
        ]),
    },
    {
      label: "External rental",
      icon: TruckIcon,
      add: () =>
        setSection("externalRentals", (rows) => [...rows, { provider: "", label: "", quantity: "1", rateUsd: "0" }]),
    },
    {
      label: "Artist",
      icon: MicrophoneStageIcon,
      add: () => setSection("artists", (rows) => [...rows, emptyArtistRow(defaultArtistDayId(draft))]),
    },
    linkedCrew
      ? {
          label: "Extra crew hours",
          icon: ClockIcon,
          add: () => draft.setManualCrewRows((rows) => [...rows, emptyCrewRow(draft, "manual")]),
        }
      : {
          label: "Crew",
          icon: UsersThreeIcon,
          add: () => draft.setCrewRows((rows) => [...rows, emptyCrewRow(draft)]),
        },
    {
      label: "Fee",
      icon: CurrencyDollarIcon,
      add: () => {
        setFeesCatalogEnabled(true);
        setSection("fees", (rows) => [...rows, { feeDefinitionId: "", label: "", quantity: "1", rateUsd: "0" }]);
      },
    },
  ];

  const totals = draft.draftTotals;
  const summary = [
    plural(lineCount, "line"),
    totals.discountAmountUsd > 0
      ? `${formatUsd(totals.subtotalUsd)} before a ${formatUsd(totals.discountAmountUsd)} discount`
      : `${formatUsd(totals.subtotalUsd)} subtotal`,
  ].join(" · ");

  return (
    <Card data-testid="invoice-line-items">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <ReceiptIcon className="size-4 text-muted-foreground" aria-hidden />
            Line items
          </CardTitle>
          <p className="text-sm text-muted-foreground" data-testid="invoice-line-items-summary">
            {summary}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" data-testid="invoice-add-line">
              <PlusIcon weight="bold" />
              Add line
              <CaretDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Add to the quote</DropdownMenuLabel>
            {addItems.map((item) => (
              <DropdownMenuItem key={item.label} onSelect={item.add}>
                <item.icon />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="@container/lines space-y-3">
        {isEmpty ? (
          <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No line items yet. Use Add line for equipment, artists, crew or fees. A quote needs at least one line to save.
          </p>
        ) : null}
        <EquipmentLines draft={draft} />
        <RentalLines draft={draft} />
        <ArtistLines draft={draft} />
        <CrewLines draft={draft} />
        <HoursLines draft={draft} />
        <FeeLines draft={draft} options={feeDefinitions ?? []} onUse={() => setFeesCatalogEnabled(true)} />
      </CardContent>
    </Card>
  );
}
