"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { formatDateTime } from "@/lib/format";

export function EventCommentsSection({ eventId }: { eventId: Id<"events"> }) {
  return (
    <ArborOnlyGuard>
      <EventCommentsPanel eventId={eventId} />
    </ArborOnlyGuard>
  );
}

function EventCommentsPanel({ eventId }: { eventId: Id<"events"> }) {
  const comments = useQuery(api.eventComments.listByEvent, { eventId });
  const mentionCandidates = useQuery(api.eventComments.listMentionCandidates, {});
  const createComment = useMutation(api.eventComments.createComment);
  const [body, setBody] = useState("");
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionPicker, setMentionPicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options: UserSelectOption[] = useMemo(
    () =>
      (mentionCandidates ?? []).map((row) => ({
        value: row.userId,
        label: row.name,
        email: row.email,
        description: [row.pronouns, row.gradYear ? `’${String(row.gradYear).slice(-2)}` : null]
          .filter(Boolean)
          .join(" · "),
      })),
    [mentionCandidates],
  );

  const mentionedOptions = options.filter((option) => mentionedUserIds.includes(option.value));

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await createComment({
        eventId,
        body,
        mentionedUserIds,
      });
      setBody("");
      setMentionedUserIds([]);
      setMentionPicker("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to post comment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="font-medium">Comments</h3>
        <p className="text-sm text-muted-foreground">
          Mentions notify Arbor Live teammates by email.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        {(comments ?? []).map((comment) => (
          <div key={comment._id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{comment.authorName}</span>
              <span>{formatDateTime(comment.createdAt)}</span>
              {comment.mentionedUsers.length ? (
                <span>
                  Mentioned {comment.mentionedUsers.map((user) => user.name).join(", ")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
          </div>
        ))}
        {comments && comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : null}
      </div>

      <textarea
        className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Write a comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <UserSelect
            value={mentionPicker}
            onChange={setMentionPicker}
            options={options.filter((option) => !mentionedUserIds.includes(option.value))}
            placeholder="Mention teammate…"
            emptyLabel="No teammates"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!mentionPicker}
          onClick={() => {
            if (!mentionPicker) return;
            setMentionedUserIds((ids) => [...ids, mentionPicker]);
            setMentionPicker("");
          }}
        >
          Add mention
        </Button>
      </div>

      {mentionedOptions.length ? (
        <div className="flex flex-wrap gap-2">
          {mentionedOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className="rounded-full border px-2 py-0.5 text-xs"
              onClick={() =>
                setMentionedUserIds((ids) => ids.filter((id) => id !== option.value))
              }
            >
              @{option.label} ×
            </button>
          ))}
        </div>
      ) : null}

      <Button type="button" disabled={saving || !body.trim()} onClick={() => void handleSubmit()}>
        {saving ? "Posting…" : "Post comment"}
      </Button>
    </div>
  );
}
