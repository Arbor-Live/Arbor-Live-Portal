"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowSquareOutIcon, BroomIcon } from "@phosphor-icons/react";
import { StatusPill } from "@/components/page-header";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { plural } from "@/lib/format";
import { HASH_STATUS_PILLS } from "@/lib/hashing";
import { hashingTabPath, hashPath } from "@/lib/hashing-tabs";
import { notify } from "@/lib/notify";

export function HashingCard() {
  const { eventId, readOnly } = useEventWorkspace();
  const addon = useQuery(api.hashing.getEventAddon, { eventId });
  const setHashing = useMutation(api.hashingSchedule.setEventHashing);
  const { confirm } = useAppDialog();
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function toggle(enabled: boolean) {
    if (!enabled && addon && addon.filled > 0) {
      const ok = await confirm({
        title: "Turn hashing off?",
        description: `${plural(addon.filled, "person", "people")} will lose this shift and need a hash again. The event stays.`,
        destructive: true,
        confirmLabel: "Turn off",
      });
      if (!ok) return;
    }
    setSaving(true);
    setRefusal(null);
    try {
      await setHashing({ eventId, enabled });
      notify.success(enabled ? "This event is now a hash." : "Hashing is off.");
    } catch (error) {
      setRefusal(getConvexErrorMessage(error, "Couldn't change hashing on this event."));
    } finally {
      setSaving(false);
    }
  }

  const started = addon?.status === "in_progress" || addon?.status === "finished";
  const pill = addon ? HASH_STATUS_PILLS[addon.status] : null;

  return (
    <Card data-testid="event-hashing-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <BroomIcon className="size-4 text-muted-foreground" />
          Hashing
        </CardTitle>
        <Switch
          checked={Boolean(addon)}
          disabled={addon === undefined || saving || readOnly || started || (addon !== null && addon.origin !== "addon")}
          onCheckedChange={(enabled) => void toggle(enabled)}
          aria-label="Enable Hashing"
          data-testid="event-hashing-switch"
        />
      </CardHeader>
      {addon && pill ? (
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
          {addon.status === "lapsed" ? (
            <Link
              href={hashingTabPath("history")}
              className="inline-flex items-center gap-1 text-primary hover:underline"
              data-testid="event-hashing-history"
            >
              Open History
              <ArrowSquareOutIcon className="size-3" />
            </Link>
          ) : (
            <>
              <span className="tabular-nums">
                {addon.filled} of {addon.capacity} booked
              </span>
              <Link
                href={hashPath(addon.hashDateId)}
                className="inline-flex items-center gap-1 text-primary hover:underline"
                data-testid="event-hashing-runner"
              >
                Open hash
                <ArrowSquareOutIcon className="size-3" />
              </Link>
            </>
          )}
        </CardContent>
      ) : null}
      {refusal ? (
        <CardContent>
          <p role="alert" className="text-sm text-destructive" data-testid="event-hashing-refusal">
            {refusal}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
