"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { StatusPill } from "@/components/page-header";
import {
  DetailSheetFooter,
  DetailSheetHeader,
  SheetField,
  SheetFields,
  SheetSection,
} from "@/components/list-page";
import { ArtistTypeBadge } from "@/components/public/artist-type-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/convex-api";
import { formatDateTime } from "@/lib/format";
import {
  BAND_APPLICATION_STATUS_LABELS,
  BAND_APPLICATION_STATUS_TONES,
  bandApplicationInviteCount,
} from "@/lib/band-application-status";

export type ArtistApplicationRow = FunctionReturnType<typeof api.bandApplications.listAdmin>[number];

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline"
    >
      <span className="truncate">{children}</span>
      <ArrowSquareOutIcon className="size-3 shrink-0" aria-hidden />
    </a>
  );
}

/**
 * The side panel body for one application. Render it keyed on the
 * application so the decline reason resets between rows. The page closes the
 * panel once an approve or decline succeeds.
 */
export function ArtistApplicationSheetBody({
  application,
  pending,
  onApprove,
  onDecline,
}: {
  application: ArtistApplicationRow;
  pending: boolean;
  onApprove: () => void;
  onDecline: (declineReason: string) => void;
}) {
  const [declineReason, setDeclineReason] = useState("");
  const isPending = application.status === "submitted";
  const invites = bandApplicationInviteCount(application);

  return (
    <>
      <DetailSheetHeader
        title={application.bandDisplayName}
        pill={
          <StatusPill tone={BAND_APPLICATION_STATUS_TONES[application.status]}>
            {BAND_APPLICATION_STATUS_LABELS[application.status]}
          </StatusPill>
        }
        description={
          <>
            {application.contactName}
            {" · "}
            <a className="underline-offset-2 hover:underline" href={`mailto:${application.contactEmail}`}>
              {application.contactEmail}
            </a>
            {application.contactPhone ? (
              <>
                {" · "}
                <a className="underline-offset-2 hover:underline" href={`tel:${application.contactPhone}`}>
                  {application.contactPhone}
                </a>
              </>
            ) : null}
          </>
        }
      />

      <SheetSection title="Application">
        <SheetFields>
          <SheetField label="Submitted">{formatDateTime(application.submittedAt)}</SheetField>
          <SheetField label="Artist type">
            <ArtistTypeBadge organizationType={application.organizationType} />
          </SheetField>
          {application.genres?.length ? <SheetField label="Genres">{application.genres.join(", ")}</SheetField> : null}
          {application.oneLiner ? <SheetField label="One-liner">{application.oneLiner}</SheetField> : null}
          {application.bio ? (
            <SheetField label="Bio">
              <span className="whitespace-pre-wrap">{application.bio}</span>
            </SheetField>
          ) : null}
          {application.demoURL ? (
            <SheetField label="Demo">
              <ExternalLink href={application.demoURL}>{application.demoURL}</ExternalLink>
            </SheetField>
          ) : null}
          {(application.artistLinks ?? []).map((link) => (
            <SheetField key={`${link.label}-${link.url}`} label={link.label}>
              <ExternalLink href={link.url}>{link.url}</ExternalLink>
            </SheetField>
          ))}
        </SheetFields>
      </SheetSection>

      <SheetSection title="Members">
        {application.isSolo ? (
          <p className="text-sm">Solo performer: {application.contactName}</p>
        ) : (
          <ul className="divide-y border text-sm" data-testid="artist-application-members">
            <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
              <span className="font-medium">{application.contactName}</span>
              <span className="truncate text-xs text-muted-foreground">Contact · {application.contactEmail}</span>
            </li>
            {application.members.map((member, index) => (
              <li key={`${member.name}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                <span>{member.name}</span>
                <span className="truncate text-xs text-muted-foreground">{member.email || "No email"}</span>
              </li>
            ))}
          </ul>
        )}
      </SheetSection>

      <SheetSection title="Decision">
        {isPending ? (
          <>
            <p className="text-sm text-muted-foreground">
              Approving creates the artist org and invites {invites === 1 ? "the contact" : `${invites} people`} to
              finish onboarding and payout setup. Their public listing stays off until they turn it on.
            </p>
            <div className="space-y-2">
              <Label htmlFor="artist-application-decline-reason">Decline reason (optional)</Label>
              <Textarea
                id="artist-application-decline-reason"
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
                placeholder="Included in the email to the contact"
                rows={3}
              />
            </div>
          </>
        ) : (
          <SheetFields>
            <SheetField label={BAND_APPLICATION_STATUS_LABELS[application.status]}>
              {application.reviewedAt ? formatDateTime(application.reviewedAt) : "—"}
            </SheetField>
            {application.status === "declined" ? (
              <SheetField label="Reason">
                <span className="whitespace-pre-wrap">{application.declineReason || "No reason given"}</span>
              </SheetField>
            ) : null}
          </SheetFields>
        )}
      </SheetSection>

      {isPending ? (
        <DetailSheetFooter
          start={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={pending}
              onClick={() => onDecline(declineReason)}
            >
              Decline
            </Button>
          }
        >
          <Button type="button" size="sm" disabled={pending} onClick={onApprove}>
            Approve
          </Button>
        </DetailSheetFooter>
      ) : null}
    </>
  );
}
