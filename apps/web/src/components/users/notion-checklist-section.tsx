"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SheetSection } from "@/components/users/directory/shared";

/** Manual steps an admin does in Notion by hand; there is no Notion integration. */
export const NOTION_CHECKLIST_ITEMS = [
  { key: "inviteToNotion", label: "Invite to Notion" },
  { key: "addToCrewGroup", label: "Add to Crew group" },
] as const;

export type NotionChecklistItemKey = (typeof NOTION_CHECKLIST_ITEMS)[number]["key"];

/** Keyed by the invitation, so the invitations tab and the crew application panel share one set of ticks. */
export function NotionChecklistSection({
  invitationId,
  checklist,
}: {
  invitationId: string;
  checklist: Record<NotionChecklistItemKey, boolean>;
}) {
  const setItem = useMutation(api.users.setInviteNotionChecklistItem);
  const [saving, setSaving] = useState<NotionChecklistItemKey | null>(null);

  async function toggle(item: NotionChecklistItemKey, done: boolean) {
    setSaving(item);
    try {
      await setItem({ invitationId, item, done });
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setSaving(null);
    }
  }

  return (
    <SheetSection title="Notion" testId="invite-notion-checklist">
      <div className="space-y-2">
        {NOTION_CHECKLIST_ITEMS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <Checkbox
              id={`invite-${invitationId}-${key}`}
              checked={checklist[key]}
              disabled={saving === key}
              onCheckedChange={(checked) => void toggle(key, checked === true)}
            />
            <Label htmlFor={`invite-${invitationId}-${key}`}>{label}</Label>
          </div>
        ))}
      </div>
    </SheetSection>
  );
}
