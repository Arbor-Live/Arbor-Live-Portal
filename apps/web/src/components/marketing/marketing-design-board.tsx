"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { MarketingPostHeroUploadField } from "@/components/files/file-upload-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";

type AdditionalLink = { label: string; url: string };

function emptyLink(): AdditionalLink {
  return { label: "", url: "" };
}

export function MarketingDesignBoard() {
  const [now] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [additionalLinks, setAdditionalLinks] = useState<AdditionalLink[]>([emptyLink()]);

  const events = useQuery(api.marketingDesigns.listEventsNeedingDesigns, { now });
  const designs = useQuery(api.marketingDesigns.listForBoard, {});
  const createDesign = useMutation(api.marketingDesigns.create);
  const markReady = useMutation(api.marketingDesigns.markReady);

  const selectedEvent = useMemo(
    () => events?.find((row) => row.eventId === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const selectedDesign = useMemo(() => {
    if (!selectedEventId) return null;
    return designs?.find((row) => row.eventId === selectedEventId) ?? selectedEvent?.design ?? null;
  }, [designs, selectedEvent, selectedEventId]);

  async function handleSaveDraft() {
    if (!selectedEventId || !imageUrl.trim()) {
      setMessage("Choose an event and upload a poster image.");
      return;
    }
    try {
      await createDesign({
        eventId: selectedEventId,
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

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No public upcoming events need posters.</p>
          ) : (
            (events ?? []).map((event) => (
              <button
                key={event.eventId}
                type="button"
                onClick={() => {
                  setSelectedEventId(event.eventId);
                  const design = event.design;
                  setImageUrl(design?.imageUrl ?? "");
                  setCaption(design?.caption ?? "");
                  setAdditionalLinks(
                    design?.additionalLinks?.length
                      ? design.additionalLinks
                      : [emptyLink()],
                  );
                }}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  selectedEventId === event.eventId ? "border-primary bg-muted/40" : "hover:bg-muted/30"
                }`}
              >
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.startAt).toLocaleString()}
                  {event.venueName ? ` · ${event.venueName}` : ""}
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
              Pick an event to upload a poster, caption, and links for Instagram and the public site.
            </p>
          ) : (
            <>
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
