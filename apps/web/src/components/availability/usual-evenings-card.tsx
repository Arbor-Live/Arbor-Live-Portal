"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { MoonStarsIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UsualEveningsFields } from "@/components/availability/usual-evenings-fields";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { usualEveningsComplete, type UsualEvenings } from "@/lib/crew-nights";
import { cn } from "@/lib/utils";

/**
 * Usual evenings (standing availability). `prompt` is the one-time ask on My
 * Availability; `settings` is the same editor on Account settings. Renders
 * nothing for people who aren't asked about availability.
 */
export function UsualEveningsCard({
  variant,
  onSaved,
  className,
}: {
  variant: "prompt" | "settings";
  onSaved?: () => void;
  className?: string;
}) {
  const data = useQuery(api.crewNights.getMyUsualEvenings, {});
  const save = useMutation(api.crewNights.setMyUsualEvenings);
  const [edits, setDraft] = useState<UsualEvenings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;
  // Start from what's saved, or the application's Fri/Sat on first ask.
  const draft = edits ?? (data.setAt ? data.usualEvenings : data.suggested);
  const suggested = !data.setAt && Object.keys(data.suggested).length > 0;

  async function onSave() {
    if (!draft) return;
    if (!usualEveningsComplete(draft)) {
      setError("Pick an answer for Thursday, Friday and Saturday.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await save({ usualEvenings: draft });
      notify.success("Saved your usual evenings.");
      onSaved?.();
    } catch (saveError) {
      setError(getConvexErrorMessage(saveError, "Couldn't save your usual evenings."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      className={cn(variant === "prompt" && "border-primary/30 bg-primary/5", className)}
      data-testid={variant === "prompt" ? "usual-evenings-prompt" : "usual-evenings-settings"}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MoonStarsIcon className="size-4 text-muted-foreground" aria-hidden />
          {variant === "prompt" ? "Which evenings are you usually free?" : "Usual evenings"}
        </CardTitle>
        <CardDescription>
          {variant === "prompt"
            ? "Answer once. New nights start from this, so most weeks you just confirm."
            : "Your standing availability. New nights on My Availability start from it."}
          {suggested ? " We filled in what you said on your application." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <UsualEveningsFields value={draft} onChange={setDraft} disabled={saving} idPrefix={`usual-${variant}`} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="button" size="sm" disabled={saving} onClick={() => void onSave()}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
