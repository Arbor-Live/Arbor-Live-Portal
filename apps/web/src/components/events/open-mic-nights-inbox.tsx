"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDateTime } from "@/lib/format";
import { getConvexErrorMessage } from "@/lib/convex-error";

function toEpoch(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function NightCreator({ onCreated }: { onCreated: (nightId: string) => void }) {
  const createNight = useMutation(api.openMic.createNight);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const startMs = toEpoch(startAt);
    const endMs = toEpoch(endAt);
    if (!title.trim()) return setError("Add a title.");
    if (!startMs) return setError("Pick a start time.");
    if (!endMs) return setError("Pick an end time.");
    if (endMs <= startMs) return setError("End time must be after start time.");
    setBusy(true);
    try {
      const id = await createNight({
        title: title.trim(),
        startAt: startMs,
        endAt: endMs,
        notes: notes.trim() || undefined,
      });
      setTitle("");
      setStartAt("");
      setEndAt("");
      setNotes("");
      onCreated(id as unknown as string);
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create open mic night</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="om-title">Title</Label>
          <Input
            id="om-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Open Mic at CoHo"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="om-start">Start</Label>
            <Input
              id="om-start"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="om-end">End</Label>
            <Input
              id="om-end"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="om-notes">Notes (optional)</Label>
          <Input
            id="om-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Theme, special instructions, etc."
          />
        </div>
        <Button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? "Creating…" : "Create night"}
        </Button>
      </CardContent>
    </Card>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "live":
      return "Live";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function OpenMicNightsInbox() {
  const nights = useQuery(api.openMic.listNights, {});
  const deleteNight = useMutation(api.openMic.deleteNight);
  const setNightStatus = useMutation(api.openMic.updateNight);
  const [showCreator, setShowCreator] = useState(false);
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="ml-auto">
          <Link href="/public/open-mic" target="_blank">
            Open public form
          </Link>
        </Button>
        <Button variant="outline" onClick={() => setShowCreator((v) => !v)}>
          {showCreator ? "Hide creator" : "Create night"}
        </Button>
      </div>

      {showCreator ? (
        <NightCreator
          onCreated={() => {
            setShowCreator(false);
          }}
        />
      ) : null}

      <div className="space-y-2">
        {(nights ?? []).map((night) => {
          const past = night.startAt < now;
          return (
            <div key={night._id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{night.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(night.startAt)}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded bg-muted px-2 py-0.5">{statusLabel(night.status)}</span>
                    <span className="rounded bg-muted px-2 py-0.5">Queued: {night.queuedCount}</span>
                    <span className="rounded bg-muted px-2 py-0.5">Performed: {night.performedCount}</span>
                    {night.hasCurrent ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700">
                        Performer on stage
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={`/dashboard/events/open-mic/${night._id}`}>Open runner</Link>
                  </Button>
                  {night.status === "scheduled" && !past ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void setNightStatus({ nightId: night._id, status: "live" })}
                    >
                      Go live
                    </Button>
                  ) : null}
                  {night.status === "live" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void setNightStatus({ nightId: night._id, status: "completed" })}
                    >
                      Mark completed
                    </Button>
                  ) : null}
                  {night.status !== "cancelled" && night.status !== "completed" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void setNightStatus({ nightId: night._id, status: "cancelled" })
                      }
                    >
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm("Delete this open mic night and all its sign-ups?")) {
                        void deleteNight({ nightId: night._id });
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        {nights && nights.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No open mic nights yet. Click “Create night” to add one.
          </p>
        ) : null}
        {nights === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}