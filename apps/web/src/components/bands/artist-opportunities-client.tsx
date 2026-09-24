"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { formatDateTime, formatDateTimeRange } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { notify } from "@/lib/notify";
import { getConvexErrorMessage } from "@/lib/convex-error";

type ArtistNeedType = "band" | "dj" | "no_preference";

const TYPE_LABELS: Record<ArtistNeedType, string> = {
  band: "Live band",
  dj: "DJ",
  no_preference: "No preference",
};

const FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "band", label: "Live band" },
  { value: "dj", label: "DJ" },
];

function InquiryComposer({
  needId,
  onDone,
}: {
  needId: Id<"eventArtistNeeds">;
  onDone: () => void;
}) {
  const submitInquiry = useMutation(api.eventArtistNeeds.submitInquiry);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    setSending(true);
    try {
      await submitInquiry({ needId, message: message.trim() || undefined });
      notify.success("Request sent. Operations will follow up.");
      onDone();
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Optional note to Operations"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={sending}>
          Send request
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={sending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ArtistOpportunitiesClient() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [composerFor, setComposerFor] = useState<string | null>(null);

  const needs = useQuery(api.eventArtistNeeds.listOpenNeedsForArtist, {
    artistType: typeFilter === "all" ? undefined : (typeFilter as ArtistNeedType),
    query: search.trim() || undefined,
  });
  const inquiries = useQuery(api.eventArtistNeeds.listMyInquiries);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Open artist needs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[200px_1fr]">
            <SearchableSelect
              value={typeFilter}
              onChange={setTypeFilter}
              options={FILTER_OPTIONS}
              placeholder="Filter by type"
              emptyLabel="All types"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by event, venue, or genre"
            />
          </div>

          {needs === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : needs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open needs match right now.</p>
          ) : (
            <ul className="space-y-3">
              {needs.map((need) => (
                <li key={need.needId} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{need.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTimeRange(need.startAt, need.endAt, need.timezone)}
                        {need.venueName ? ` · ${need.venueName}` : ""}
                      </p>
                      <p className="mt-1 text-sm">
                        {need.label.trim() ? `${need.label.trim()} · ` : ""}
                        {TYPE_LABELS[need.artistType]}
                        {need.genres ? ` · ${need.genres}` : ""}
                      </p>
                    </div>
                    {need.alreadyInquired ? (
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                        Requested
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setComposerFor((current) =>
                            current === need.needId ? null : need.needId,
                          )
                        }
                      >
                        Request to perform
                      </Button>
                    )}
                  </div>
                  {composerFor === need.needId ? (
                    <div className="mt-3">
                      <InquiryComposer needId={need.needId} onDone={() => setComposerFor(null)} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My requests</CardTitle>
        </CardHeader>
        <CardContent>
          {inquiries === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : inquiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have not requested any events yet.</p>
          ) : (
            <ul className="space-y-2">
              {inquiries.map((inquiry) => (
                <li
                  key={inquiry.inquiryId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{inquiry.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(inquiry.startAt, "short", inquiry.timezone ?? undefined)}
                      {inquiry.genres ? ` · ${inquiry.genres}` : ""}
                    </p>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                    {inquiry.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
