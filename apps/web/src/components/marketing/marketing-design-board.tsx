"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { MarketingPostHeroUploadField } from "@/components/files/file-upload-field";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  formatEventVisibilityLabel,
  type EventVisibility,
} from "@/lib/event-visibility";
import { cn } from "@/lib/utils";

type AdditionalLink = { label: string; url: string };
type PosterWorkView = "unassigned" | "mine" | "all";

const POSTER_WORK_VIEWS: Array<{ value: PosterWorkView; label: string }> = [
  { value: "mine", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
  { value: "all", label: "All upcoming" },
];

function emptyLink(): AdditionalLink {
  return { label: "", url: "" };
}

function formatEventMeta(startAt: number, venueName?: string) {
  const when = new Date(startAt).toLocaleString();
  return venueName ? `${when} · ${venueName}` : when;
}

export function MarketingDesignBoard() {
  const [now] = useState(() => Date.now());
  const [view, setView] = useState<PosterWorkView>("mine");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [additionalLinks, setAdditionalLinks] = useState<AdditionalLink[]>([emptyLink()]);

  const events = useQuery(api.marketingDesigns.listUpcomingPosterWork, { now, view });
  const managerList = useQuery(api.invoices.listManagers, {});
  const createDesign = useMutation(api.marketingDesigns.create);
  const markReady = useMutation(api.marketingDesigns.markReady);
  const assignPosterDesigner = useMutation(api.marketingDesigns.assignPosterDesigner);

  const userSelectOptions: UserSelectOption[] = useMemo(
    () =>
      (managerList ?? []).map((entry) => ({
        value: entry.id,
        label: entry.name,
        description: [entry.role, entry.email].filter(Boolean).join(" • "),
        role: entry.role,
        email: entry.email,
      })),
    [managerList],
  );

  const selectedEvent = useMemo(
    () => events?.find((row) => row.eventId === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const selectedDesign = selectedEvent?.design ?? null;

  function selectEvent(eventId: Id<"events">) {
    const event = events?.find((row) => row.eventId === eventId);
    if (!event) return;
    setSelectedEventId(eventId);
    setImageUrl(event.design?.imageUrl ?? "");
    setCaption(event.design?.caption ?? "");
    setAdditionalLinks(
      event.design?.additionalLinks?.length ? event.design.additionalLinks : [emptyLink()],
    );
  }

  async function handleAssigneeChange(assigneeUserId: string) {
    if (!selectedEventId) return;
    try {
      await assignPosterDesigner({
        eventId: selectedEventId,
        assigneeUserId: assigneeUserId || undefined,
      });
      setMessage(assigneeUserId ? "Poster designer assigned." : "Poster designer unassigned.");
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }

  async function handleSaveDraft() {
    if (!selectedEventId || !imageUrl.trim()) {
      setMessage("Choose an event and upload a poster image.");
      return;
    }
    try {
      await createDesign({
        eventId: selectedEventId,
        assigneeUserId: selectedEvent?.assigneeUserId ?? undefined,
        imageUrl,
        caption: caption.trim() || undefined,
        additionalLinks: additionalLinks.filter((link) => link.label.trim() && link.url.trim()),
      });
      setMessage("Draft saved.");
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }

  async function handleMarkReady() {
    if (!selectedEventId) return;
    try {
      if (!imageUrl.trim()) {
        setMessage("Upload a poster image before publishing.");
        return;
      }
      const designId = await createDesign({
        eventId: selectedEventId,
        assigneeUserId: selectedEvent?.assigneeUserId ?? undefined,
        imageUrl,
        caption: caption.trim() || undefined,
        additionalLinks: additionalLinks.filter((link) => link.label.trim() && link.url.trim()),
      });
      await markReady({ id: designId });
      setMessage("Published to Instagram and the public site.");
    } catch (error) {
      setMessage(getConvexErrorMessage(error));
    }
  }

  const emptyLabel =
    view === "mine"
      ? "No upcoming events are assigned to you in the next four weeks."
      : view === "unassigned"
        ? "No unassigned upcoming events in the next four weeks."
        : "No upcoming events in the next four weeks.";

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Upcoming poster work</CardTitle>
          <p className="text-xs text-muted-foreground">
            Events in the next four weeks. Assignments appear immediately, including before an event is public.
          </p>
          <div className="flex flex-wrap gap-2">
            {POSTER_WORK_VIEWS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={view === option.value ? "default" : "outline"}
                onClick={() => setView(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            (events ?? []).map((event) => (
              <button
                key={event.eventId}
                type="button"
                onClick={() => selectEvent(event.eventId)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left text-sm transition",
                  selectedEventId === event.eventId ? "border-primary bg-muted/40" : "hover:bg-muted/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{event.title}</p>
                  {event.design?.status === "published" ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                      Published
                    </span>
                  ) : event.design?.imageUrl ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                      Draft
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{formatEventMeta(event.startAt, event.venueName)}</p>
                <p className="text-xs text-muted-foreground">
                  {event.assigneeName ? `Assigned to ${event.assigneeName}` : "Unassigned"}
                  {event.visibility !== "public"
                    ? ` · ${formatEventVisibilityLabel(event.visibility as EventVisibility)}`
                    : ""}
                </p>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedEvent ? selectedEvent.title : "Select an event"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedEvent ? (
            <p className="text-sm text-muted-foreground">
              Pick an event to assign a designer, upload a poster, add a caption and links, then publish to
              Instagram and the public site.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Poster designer</Label>
                <UserSelect
                  value={selectedEvent.assigneeUserId ?? ""}
                  onChange={(value) => void handleAssigneeChange(value)}
                  options={userSelectOptions}
                  emptyLabel="Unassigned"
                  placeholder="Assign marketing designer..."
                />
              </div>
              <MarketingPostHeroUploadField
                label="Poster image"
                currentUrl={imageUrl}
                onUploaded={setImageUrl}
              />
              <div className="space-y-2">
                <Label htmlFor="design-caption">Caption</Label>
                <textarea
                  id="design-caption"
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Instagram caption and event description"
                  className="flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-2">
                <Label>Additional links</Label>
                {additionalLinks.map((link, index) => (
                  <div key={`link-${index}`} className="grid gap-2 md:grid-cols-2">
                    <Input
                      value={link.label}
                      placeholder="Label (e.g. Partiful RSVP)"
                      onChange={(e) => {
                        const next = [...additionalLinks];
                        next[index] = { ...next[index], label: e.target.value };
                        setAdditionalLinks(next);
                      }}
                    />
                    <Input
                      value={link.url}
                      placeholder="https://..."
                      onChange={(e) => {
                        const next = [...additionalLinks];
                        next[index] = { ...next[index], url: e.target.value };
                        setAdditionalLinks(next);
                      }}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAdditionalLinks((prev) => [...prev, emptyLink()])}
                >
                  Add link
                </Button>
              </div>
              {selectedDesign?.status === "published" ? (
                <p className="text-sm text-muted-foreground">
                  Published
                  {selectedDesign.instagramPostId
                    ? ` · Instagram ${selectedDesign.instagramPostId}`
                    : ""}
                  {selectedDesign.lastError ? ` · Error: ${selectedDesign.lastError}` : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void handleSaveDraft()}>
                  Save draft
                </Button>
                <Button type="button" onClick={() => void handleMarkReady()}>
                  Mark ready & publish
                </Button>
              </div>
            </>
          )}
          {message ? (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
