"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { StoredAssetLink } from "@/components/files/stored-asset-image";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { isEmptyLexicalJson } from "@/lib/validations/venues";

const LexicalViewer = dynamic(
  () => import("@/components/editor/lexical-viewer").then((m) => m.LexicalViewer),
  { ssr: false },
);

export function VenueDetailsButton({
  venueId,
  label = "Venue details",
}: {
  venueId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <VenueDetailsSheet
        venueId={open ? (venueId as Id<"venues">) : null}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function VenueDetailsSheet({
  venueId,
  open,
  onOpenChange,
}: {
  venueId: Id<"venues"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const details = useQuery(api.venues.getDetails, venueId && open ? { id: venueId } : "skip");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{details?.name ?? "Venue"}</SheetTitle>
          <SheetDescription>{details?.path ?? "Loading venue details…"}</SheetDescription>
        </SheetHeader>

        {!details ? (
          <div className="p-4 text-sm text-muted-foreground">
            {venueId ? "Loading…" : "No venue selected."}
          </div>
        ) : (
          <div className="space-y-5 p-4 text-sm">
            <section className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Type
              </p>
              <p>
                {details.kind} · {details.venueType}
              </p>
              {details.nicknames.length > 0 ? (
                <p className="text-muted-foreground">Also known as: {details.nicknames.join(" · ")}</p>
              ) : null}
            </section>

            {(details.capacity !== undefined ||
              details.address ||
              details.googleMapsUrl) && (
              <section className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Location
                </p>
                {details.capacity !== undefined ? <p>Capacity: {details.capacity}</p> : null}
                {details.address ? <p className="whitespace-pre-wrap">{details.address}</p> : null}
                {details.googleMapsUrl ? (
                  <a
                    href={details.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Open in Google Maps
                  </a>
                ) : null}
              </section>
            )}

            {details.circuits.length > 0 ? (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Power / circuits
                </p>
                <ul className="space-y-1">
                  {details.circuits.map((circuit, index) => (
                    <li key={`${circuit.label}-${index}`} className="rounded-md border px-2 py-1">
                      {circuit.label}: {circuit.voltage}V / {circuit.amperage}A
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {(details.contactName || details.contactEmail || details.contactPhone) && (
              <section className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contact
                </p>
                {details.contactName ? <p>{details.contactName}</p> : null}
                {details.contactEmail ? (
                  <a
                    href={`mailto:${details.contactEmail}`}
                    className="block text-primary underline underline-offset-2"
                  >
                    {details.contactEmail}
                  </a>
                ) : null}
                {details.contactPhone ? (
                  <a
                    href={`tel:${details.contactPhone}`}
                    className="block text-primary underline underline-offset-2"
                  >
                    {details.contactPhone}
                  </a>
                ) : null}
              </section>
            )}

            {details.notesJson && !isEmptyLexicalJson(details.notesJson) ? (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Notes
                </p>
                <LexicalViewer contentJson={details.notesJson} className="text-sm" />
              </section>
            ) : null}

            {details.documentationLinks.length > 0 ? (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Documentation
                </p>
                <ul className="space-y-1">
                  {details.documentationLinks.map((link, index) => (
                    <li key={`${link.url}-${index}`}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {link.title || link.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {details.files.length > 0 ? (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Files
                </p>
                <ul className="space-y-1">
                  {details.files.map((file, index) => (
                    <li key={`${file.r2Key}-${index}`}>
                      <StoredAssetLink
                        storedValue={file.r2Key}
                        className="text-primary underline underline-offset-2"
                      >
                        {file.title || file.fileName}
                      </StoredAssetLink>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
