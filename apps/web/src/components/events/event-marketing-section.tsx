"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { useSessionViewer } from "@/components/session-shell-provider";
import {
  EventMarketingContentFields,
  emptyMarketingLink,
  filterMarketingLinks,
  type MarketingAdditionalLink,
} from "@/components/marketing/event-marketing-content-fields";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { buildUserSelectDescription } from "@/lib/user-select-description";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/format";
import { formatEventVisibilityLabel, type EventVisibility } from "@/lib/event-visibility";

function statusLabel(status: "draft" | "ready" | "published" | null) {
  if (status === "published") return "Published (website + Instagram)";
  if (status === "ready") return "On website (Instagram not published)";
  if (status === "draft") return "Draft";
  return "No marketing content yet";
}

export function EventMarketingSection({ eventId }: { eventId: Id<"events"> }) {
  const viewer = useSessionViewer();
  const canEdit = Boolean(
    viewer?.isAdmin ||
      viewer?.verticals.includes("Marketing") ||
      viewer?.verticals.includes("Operations"),
  );
  const design = useQuery(api.marketingDesigns.getForEvent, { eventId });
  const managerList = useQuery(api.invoices.listManagers, canEdit ? {} : "skip");
  const upsert = useMutation(api.marketingDesigns.upsertForEvent);
  const assignPosterDesigner = useMutation(api.marketingDesigns.assignPosterDesigner);
  const markReady = useMutation(api.marketingDesigns.markReady);

  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [additionalLinks, setAdditionalLinks] = useState<MarketingAdditionalLink[]>([
    emptyMarketingLink(),
  ]);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const hydrateKey = design ? `${eventId}:${design.designId ?? "none"}` : null;
  if (hydrateKey && hydratedKey !== hydrateKey) {
    setHydratedKey(hydrateKey);
    setImageUrl(design?.imageUrl ?? "");
    setCaption(design?.caption ?? "");
    setAdditionalLinks(
      design?.additionalLinks?.length ? design.additionalLinks : [emptyMarketingLink()],
    );
  }

  const userSelectOptions: UserSelectOption[] = useMemo(
    () =>
      (managerList ?? []).map((entry) => ({
        value: entry.id,
        label: entry.name,
        description: buildUserSelectDescription(entry),
        role: entry.role,
        email: entry.email,
      })),
    [managerList],
  );

  if (design === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Marketing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading marketing content…</p>
        </CardContent>
      </Card>
    );
  }

  if (design === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Marketing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Event not found.</p>
        </CardContent>
      </Card>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await upsert({
        eventId,
        imageUrl: imageUrl.trim() || undefined,
        caption,
        additionalLinks: filterMarketingLinks(additionalLinks),
      });
      notify.success("Marketing content saved.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!imageUrl.trim() && !design?.imageUrl) {
      notify.error("Upload a poster image before publishing to Instagram.");
      return;
    }
    setPublishing(true);
    try {
      const { designId } = await upsert({
        eventId,
        imageUrl: imageUrl.trim() || undefined,
        caption,
        additionalLinks: filterMarketingLinks(additionalLinks),
      });
      await markReady({ id: designId });
      notify.success("Published to Instagram and the public site.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setPublishing(false);
    }
  }

  async function handleAssigneeChange(assigneeUserId: string) {
    try {
      await assignPosterDesigner({
        eventId,
        assigneeUserId: assigneeUserId || undefined,
      });
      notify.success(assigneeUserId ? "Poster designer assigned." : "Poster designer unassigned.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Marketing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <p>{statusLabel(design.status)}</p>
            <p>·</p>
            <p>{formatEventVisibilityLabel(design.visibility as EventVisibility)}</p>
            {design.publishedAt ? (
              <>
                <p>·</p>
                <p>Published {formatDateTime(design.publishedAt)}</p>
              </>
            ) : null}
            {design.instagramPostId ? (
              <>
                <p>·</p>
                <p>Instagram {design.instagramPostId}</p>
              </>
            ) : null}
          </div>
          {design.lastError ? (
            <p className="text-sm text-destructive">Last publish error: {design.lastError}</p>
          ) : null}
          {design.publicEventUrl ? (
            <p className="text-sm">
              <Link href={design.publicEventUrl} className="underline" target="_blank">
                Open public event page
              </Link>
            </p>
          ) : null}

          {canEdit ? (
            <>
              <div className="space-y-2">
                <Label>Poster designer</Label>
                <UserSelect
                  value={design.assigneeUserId ?? ""}
                  onChange={(value) => void handleAssigneeChange(value)}
                  options={userSelectOptions}
                  emptyLabel="Unassigned"
                  placeholder="Assign marketing designer..."
                />
              </div>

              <EventMarketingContentFields
                idPrefix="event-marketing"
                imageUrl={imageUrl}
                onImageUrlChange={setImageUrl}
                imagePreviewUrl={design.imagePreviewUrl}
                caption={caption}
                onCaptionChange={setCaption}
                additionalLinks={additionalLinks}
                onAdditionalLinksChange={setAdditionalLinks}
                disabled={saving || publishing}
                posterUpload={{ type: "event", eventId }}
              />

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  disabled={publishing || !design.canPublish}
                  onClick={() => void handlePublish()}
                >
                  {publishing ? "Publishing…" : "Publish to Instagram"}
                </Button>
              </div>
              {!design.canPublish ? (
                <p className="text-xs text-muted-foreground">
                  Event visibility must be public before Instagram publish.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <EventMarketingContentFields
                idPrefix="event-marketing-readonly"
                imageUrl={design.imageUrl ?? ""}
                onImageUrlChange={() => undefined}
                imagePreviewUrl={design.imagePreviewUrl}
                caption={design.caption ?? ""}
                onCaptionChange={() => undefined}
                additionalLinks={design.additionalLinks?.length ? design.additionalLinks : [emptyMarketingLink()]}
                onAdditionalLinksChange={() => undefined}
                readOnly
                posterUpload={{ type: "event", eventId }}
              />
              {design.assigneeName ? (
                <p className="text-sm text-muted-foreground">Poster designer: {design.assigneeName}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Marketing or Operations can edit poster, description, and links.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
