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
import { formatVenueKindLabel, isEmptyLexicalJson, type VenueKind } from "@/lib/validations/venues";

const LexicalViewer = dynamic(
  () => import("@/components/editor/lexical-viewer").then((m) => m.LexicalViewer),
  { ssr: false },
);

function SourceHint({ sourcePath, inherited }: { sourcePath: string; inherited: boolean }) {
  if (!inherited) return null;
  return (
    <p className="text-xs text-muted-foreground">
      From <span className="font-medium text-foreground/80">{sourcePath}</span>
    </p>
  );
}

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
                {formatVenueKindLabel(details.kind as VenueKind)} · {details.venueType}
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
                {details.address ? (
                  <div className="space-y-0.5">
                    {details.addressMeta ? (
                      <SourceHint
                        sourcePath={details.addressMeta.sourcePath}
                        inherited={details.addressMeta.inherited}
                      />
                    ) : null}
                    <p className="whitespace-pre-wrap">{details.address}</p>
                  </div>
                ) : null}
                {details.googleMapsUrl ? (
                  <div className="space-y-0.5">
                    {details.googleMapsUrlMeta ? (
                      <SourceHint
                        sourcePath={details.googleMapsUrlMeta.sourcePath}
                        inherited={details.googleMapsUrlMeta.inherited}
                      />
                    ) : null}
                    <a
                      href={details.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      Open in Google Maps
                    </a>
                  </div>
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

            {details.contacts.length > 0 ? (
              <section className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contact
                </p>
                {details.contacts.map((contact, index) => (
                  <div key={`${contact.sourcePath}-${index}`} className="space-y-1">
                    <SourceHint sourcePath={contact.sourcePath} inherited={contact.inherited} />
                    {contact.contactName ? <p>{contact.contactName}</p> : null}
                    {contact.contactEmail ? (
                      <a
                        href={`mailto:${contact.contactEmail}`}
                        className="block text-primary underline underline-offset-2"
                      >
                        {contact.contactEmail}
                      </a>
                    ) : null}
                    {contact.contactPhone ? (
                      <a
                        href={`tel:${contact.contactPhone}`}
                        className="block text-primary underline underline-offset-2"
                      >
                        {contact.contactPhone}
                      </a>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}

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
                <ul className="space-y-2">
                  {details.documentationLinks.map((link, index) => (
                    <li key={`${link.url}-${index}`} className="space-y-0.5">
                      <SourceHint sourcePath={link.sourcePath} inherited={link.inherited} />
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
                <ul className="space-y-2">
                  {details.files.map((file, index) => (
                    <li key={`${file.r2Key}-${index}`} className="space-y-0.5">
                      <SourceHint sourcePath={file.sourcePath} inherited={file.inherited} />
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
