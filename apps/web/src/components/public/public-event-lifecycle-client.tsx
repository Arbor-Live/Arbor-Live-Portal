"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MarkdownContent } from "@/components/markdown-content";

export function PublicEventLifecycleClient({ token }: { token: string }) {
  const data = useQuery(api.invoices.getPublicQuoteByToken, { token });
  const approve = useMutation(api.invoices.approveByToken);
  const requestChanges = useMutation(api.invoices.requestChangesByToken);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (data === undefined) {
    return <div className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">Loading quote...</div>;
  }
  if (!data) {
    return <div className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">This quote link is invalid or expired.</div>;
  }

  const locked = data.invoice.clientApprovalStatus !== "pending";
  const grouped = {
    equipment: data.lineItems.filter((line) => line.section === "equipment_package" || line.section === "equipment_type"),
    external: data.lineItems.filter((line) => line.section === "external_rental"),
    artists: data.lineItems.filter((line) => line.section === "artist"),
    crew: data.lineItems.filter((line) => line.section === "crew"),
    fees: data.lineItems.filter((line) => line.section === "fee"),
  };
  const lifecycle = [
    {
      label: "Quote approval complete",
      state:
        data.invoice.clientApprovalStatus === "approved"
          ? "complete"
          : data.invoice.clientApprovalStatus === "changes_requested"
            ? "attention"
            : "current",
      hint:
        data.invoice.clientApprovalStatus === "approved"
          ? "Approved by client"
          : data.invoice.clientApprovalStatus === "changes_requested"
            ? "Changes were requested"
            : "Waiting for approval",
    },
    {
      label: "Pre-production",
      state: data.invoice.clientApprovalStatus === "approved" ? "current" : "upcoming",
      hint: "Placeholder stage",
    },
    {
      label: "Ready to run",
      state: "upcoming",
      hint: "Placeholder stage",
    },
    {
      label: "Day-of-event",
      state: "upcoming",
      hint: "Placeholder stage",
    },
    {
      label: "Full payment received",
      state: "upcoming",
      hint: "Placeholder stage",
    },
  ] as const;
  const approvalDone = data.invoice.clientApprovalStatus === "approved";
  const linkedEvent = data.event;
  const performers = linkedEvent?.assignments.filter((row) => row.assignmentType === "performer") ?? [];
  const dayOfLead = linkedEvent?.assignments.find((row) => row.assignmentType === "day_of_lead");
  const crewAssignments = linkedEvent?.assignments.filter((row) => row.assignmentType === "crew") ?? [];
  const docs = linkedEvent?.artifacts.filter((row) => row.artifactType === "document") ?? [];
  const pullLists = linkedEvent?.artifacts.filter((row) => row.artifactType === "pull_list") ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Quote {data.invoice.invoiceNumber}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Issued: {data.invoice.issueDate}</p>
            {linkedEvent?.title ? <p>Event: {linkedEvent.title}</p> : null}
            {data.invoice.clientGroupName ? <p>Group: {data.invoice.clientGroupName}</p> : null}
            {data.invoice.clientContactName ? <p>Contact: {data.invoice.clientContactName}</p> : null}
            <p className="text-base font-semibold">Total: ${data.invoice.totalUsd.toFixed(2)}</p>
            <p className="text-muted-foreground">Status: {data.invoice.clientApprovalStatus}</p>
            {data.invoice.clientApprovalNote ? <p>Change request note: {data.invoice.clientApprovalNote}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Event Manager</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{data.invoice.managerName}</p>
            {data.invoice.managerEmail ? (
              <p>
                <a className="underline" href={`mailto:${data.invoice.managerEmail}`}>
                  {data.invoice.managerEmail}
                </a>
              </p>
            ) : (
              <p className="text-muted-foreground">Email not provided</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Event Lifecycle</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-5">
            {lifecycle.map((stage) => (
              <div key={`progress-${stage.label}`} className="rounded-md border px-3 py-2 text-xs">
                <p className="font-medium">{stage.label}</p>
                <p
                  className={
                    stage.state === "complete"
                      ? "text-emerald-600"
                      : stage.state === "current"
                        ? "text-blue-600"
                        : stage.state === "attention"
                          ? "text-amber-600"
                          : "text-muted-foreground"
                  }
                >
                  {stage.state === "complete"
                    ? "Complete"
                    : stage.state === "current"
                      ? "Current"
                      : stage.state === "attention"
                        ? "Needs Update"
                        : "Upcoming"}
                </p>
              </div>
            ))}
          </div>
          {lifecycle.map((stage) => (
            <div key={stage.label} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">{stage.label}</p>
                <span
                  className={
                    stage.state === "complete"
                      ? "text-emerald-600"
                      : stage.state === "current"
                        ? "text-blue-600"
                        : stage.state === "attention"
                          ? "text-amber-600"
                          : "text-muted-foreground"
                  }
                >
                  {stage.state === "complete"
                    ? "Complete"
                    : stage.state === "current"
                      ? "Current"
                      : stage.state === "attention"
                        ? "Needs Update"
                        : "Upcoming"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{stage.hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Event Operations (Single Pane)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <PlaceholderBlock
            title="Venue"
            items={[
              `Location: ${
                linkedEvent?.venueName ?? (approvalDone ? "TBD - pending ops confirmation" : "Available after quote approval")
              }`,
              `Event type: ${linkedEvent?.eventType ?? (approvalDone ? "TBD" : "Pending")}`,
              `Host: ${linkedEvent?.host ?? (approvalDone ? "TBD" : "Pending")}`,
            ]}
            enabled={approvalDone}
          />
          <PlaceholderBlock
            title="Shift Info"
            items={[
              `Crew shifts logged: ${linkedEvent?.shifts.length ?? 0}`,
              `Crew hours tracked: ${
                linkedEvent?.shifts.reduce((acc, row) => acc + row.hours, 0).toFixed(2) ?? (approvalDone ? "TBD" : "Pending")
              }`,
              `Break coverage: ${approvalDone ? "Placeholder" : "Pending"}`,
            ]}
            enabled={approvalDone}
          />
          <PlaceholderBlock
            title="People Assigned"
            items={[
              `Crew assigned: ${crewAssignments.length || (approvalDone ? "Unassigned" : "Pending")}`,
              `Event manager: ${data.invoice.managerName}`,
              `Ops contacts: ${linkedEvent?.assignments.length ?? 0}`,
            ]}
            enabled={approvalDone}
          />
          <PlaceholderBlock
            title="Day-Of Event Lead"
            items={[
              `Lead: ${dayOfLead?.personName ?? (approvalDone ? "TBD" : "Pending")}`,
              `Contact: ${dayOfLead?.contactEmail ?? (approvalDone ? "TBD" : "Pending")}`,
              `On-site check-in: ${approvalDone ? "TBD" : "Pending"}`,
            ]}
            enabled={approvalDone}
          />
          <PlaceholderBlock
            title="Performers"
            items={[
              `Primary performer(s): ${performers.map((row) => row.personName).join(", ") || (approvalDone ? "TBD" : "Pending")}`,
              `Hospitality notes: ${approvalDone ? "TBD" : "Pending"}`,
              `Backline needs: ${approvalDone ? "TBD" : "Pending"}`,
            ]}
            enabled={approvalDone}
          />
          <PlaceholderBlock
            title="Client Checklist"
            items={[
              `Pre-production call scheduled: ${approvalDone ? "No" : "Pending approval"}`,
              `Final run of show shared: ${approvalDone ? "No" : "Pending approval"}`,
              `Payment status milestone: ${approvalDone ? "In progress" : "Pending approval"}`,
              `Documents attached: ${docs.length}`,
              `Pull lists attached: ${pullLists.length}`,
            ]}
            enabled={approvalDone}
          />
        </CardContent>
      </Card>

      {grouped.equipment.length ? <QuoteSection title="Equipment" rows={grouped.equipment} /> : null}
      {grouped.external.length ? <QuoteSection title="External Rentals" rows={grouped.external} /> : null}
      {grouped.artists.length ? <QuoteSection title="Artists" rows={grouped.artists} /> : null}
      {grouped.crew.length ? <QuoteSection title="Crew" rows={grouped.crew} /> : null}
      {grouped.fees.length ? <QuoteSection title="Fees" rows={grouped.fees} /> : null}

      <Card>
        <CardHeader><CardTitle>Totals</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <p>Equipment: ${data.invoice.equipmentSubtotalUsd.toFixed(2)}</p>
          <p>External rentals: ${data.invoice.externalRentalsSubtotalUsd.toFixed(2)}</p>
          <p>Artists: ${data.invoice.artistsSubtotalUsd.toFixed(2)}</p>
          <p>Crew: ${data.invoice.crewSubtotalUsd.toFixed(2)}</p>
          <p>Fees: ${data.invoice.feesSubtotalUsd.toFixed(2)}</p>
          <p>Subtotal: ${data.invoice.subtotalUsd.toFixed(2)}</p>
          <p>Discount: -${data.invoice.discountAmountUsd.toFixed(2)}</p>
          <p className="text-base font-semibold">Total: ${data.invoice.totalUsd.toFixed(2)}</p>
        </CardContent>
      </Card>

      {data.invoice.notes ? (
        <Card>
          <CardHeader><CardTitle>Quote Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{data.invoice.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Terms & Conditions</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <MarkdownContent>{data.termsAndConditionsMarkdown || "_No terms configured._"}</MarkdownContent>
          <div className="flex items-center gap-2">
            <input
              id="accept-terms"
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              disabled={locked}
            />
            <Label htmlFor="accept-terms">I accept the terms and conditions (version {data.termsVersion}).</Label>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={locked || !acceptTerms || saving}
              onClick={async () => {
                setSaving(true);
                setMessage(null);
                try {
                  await approve({ token, acceptTerms: true });
                  setMessage("Quote approved. Thank you.");
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Could not submit approval.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Approve Quote
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Request Changes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Tell us what changes are needed"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={locked}
          />
          <Button
            type="button"
            variant="outline"
            disabled={locked || !note.trim() || saving}
            onClick={async () => {
              setSaving(true);
              setMessage(null);
              try {
                await requestChanges({ token, note: note.trim() });
                setMessage("Change request submitted.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Could not submit change request.");
              } finally {
                setSaving(false);
              }
            }}
          >
            Request Changes
          </Button>
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-primary">{message}</p> : null}
    </div>
  );
}

function PlaceholderBlock({
  title,
  items,
  enabled,
}: {
  title: string;
  items: string[];
  enabled: boolean;
}) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <p className="font-medium">{title}</p>
        <span className={enabled ? "text-emerald-600 text-xs" : "text-muted-foreground text-xs"}>
          {enabled ? "Active placeholder" : "Locked"}
        </span>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <p key={`${title}-${item}`} className="text-muted-foreground">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function QuoteSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ _id: string; label: string; quantity: number; rateUsd: number; amountUsd: number; notes?: string }>;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((line) => (
          <div key={line._id} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{line.label}</span>
              <span>{line.quantity} x ${line.rateUsd.toFixed(2)} = ${line.amountUsd.toFixed(2)}</span>
            </div>
            {line.notes ? <p className="mt-1 text-xs text-muted-foreground">{line.notes}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
