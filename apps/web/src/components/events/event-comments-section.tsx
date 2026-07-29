"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { formatDateTime } from "@/lib/format";
import { fuzzyScoreHaystack } from "@/lib/fuzzy-match";

type MentionCandidate = {
  userId: string;
  name: string;
  email: string;
  pronouns?: string;
  gradYear?: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMentionedUserIds(body: string, candidates: MentionCandidate[]): string[] {
  const sorted = [...candidates].sort((a, b) => b.name.length - a.name.length);
  const ids: string[] = [];
  for (const candidate of sorted) {
    const pattern = new RegExp(
      `(^|[\\s])@${escapeRegExp(candidate.name)}(?=$|[\\s,.!?;:])`,
      "g",
    );
    if (pattern.test(body)) ids.push(candidate.userId);
  }
  return ids;
}

/** Active `@query` at the caret, if any. */
function getActiveMention(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const atIndex = before.lastIndexOf("@");
  if (atIndex < 0) return null;
  if (atIndex > 0 && !/\s/.test(before[atIndex - 1]!)) return null;
  const query = before.slice(atIndex + 1);
  if (/\s/.test(query)) return null;
  return { start: atIndex, query };
}

function renderBodyWithMentions(body: string, mentionedNames: string[]): ReactNode {
  if (!mentionedNames.length) return body;
  const sorted = [...mentionedNames].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `@(?:${sorted.map(escapeRegExp).join("|")})(?=$|[\\s,.!?;:])`,
    "g",
  );
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(body.slice(lastIndex, start));
    nodes.push(
      <span key={`${start}-${match[0]}`} className="font-medium text-sky-700 dark:text-sky-300">
        {match[0]}
      </span>,
    );
    lastIndex = start + match[0].length;
  }
  if (lastIndex < body.length) nodes.push(body.slice(lastIndex));
  return nodes.length ? nodes : body;
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [cursor, setCursor] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(() => mentionCandidates ?? [], [mentionCandidates]);
  const activeMention = getActiveMention(body, cursor);
  const filteredMentions = useMemo(() => {
    if (!activeMention) return [];
    const query = activeMention.query.trim().toLowerCase();
    const scored = candidates
      .map((row) => {
        const score = query
          ? fuzzyScoreHaystack(query, [row.name, row.email, row.pronouns])
          : 1;
        return { row, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name));
    return scored.slice(0, 8).map((entry) => entry.row);
  }, [activeMention, candidates]);

  const showMentionMenu = Boolean(activeMention) && filteredMentions.length > 0;

  function insertMention(candidate: MentionCandidate) {
    if (!activeMention) return;
    const before = body.slice(0, activeMention.start);
    const after = body.slice(cursor);
    const insertion = `@${candidate.name} `;
    const nextBody = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    setBody(nextBody);
    setCursor(nextCursor);
    setHighlightIndex(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await createComment({
        eventId,
        body,
        mentionedUserIds: extractMentionedUserIds(body, candidates),
      });
      setBody("");
      setCursor(0);
      setHighlightIndex(0);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to post comment.");
    } finally {
      setSaving(false);
    }
  }

  function onTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!showMentionMenu) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((index) => (index + 1) % filteredMentions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex(
        (index) => (index - 1 + filteredMentions.length) % filteredMentions.length,
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const selected = filteredMentions[highlightIndex];
      if (!selected) return;
      event.preventDefault();
      insertMention(selected);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      // Move cursor past the @ so the menu closes without deleting text.
      const el = textareaRef.current;
      if (!el) return;
      const next = Math.min(body.length, cursor + 1);
      el.setSelectionRange(next, next);
      setCursor(next);
    }
  }

  return (
      <div className="space-y-3 rounded-md border p-4" data-testid="event-comments">
      <div>
        <h3 className="font-medium">Comments</h3>
        <p className="text-sm text-muted-foreground">
          Type <span className="font-medium">@</span> to mention a teammate — they get an email.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        {(comments ?? []).map((comment) => (
          <div key={comment._id} className="rounded-md border p-3" data-testid="event-comment-row">
            <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{comment.authorName}</span>
              <span>{formatDateTime(comment.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm" data-testid="event-comment-body">
              {renderBodyWithMentions(
                comment.body,
                comment.mentionedUsers.map((user) => user.name),
              )}
            </p>
          </div>
        ))}
        {comments && comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : null}
      </div>

      <div className="relative space-y-2">
        <textarea
          ref={textareaRef}
          data-testid="event-comment-input"
          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Write a comment… use @ to mention someone"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setCursor(e.target.selectionStart);
            setHighlightIndex(0);
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart)}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyDown={onTextareaKeyDown}
        />

        {showMentionMenu ? (
          <div
            className="absolute left-0 right-0 z-20 max-h-56 overflow-auto rounded-md border bg-popover p-1 shadow-md"
            style={{ top: "100%", marginTop: 4 }}
            role="listbox"
            data-testid="event-comment-mention-menu"
          >
            {filteredMentions.map((candidate, index) => {
              const description = [
                candidate.pronouns,
                candidate.gradYear ? `’${String(candidate.gradYear).slice(-2)}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <button
                  key={candidate.userId}
                  type="button"
                  role="option"
                  aria-selected={index === highlightIndex}
                  className={`flex w-full flex-col rounded px-2 py-1.5 text-left text-sm ${
                    index === highlightIndex ? "bg-accent" : "hover:bg-muted/60"
                  }`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(candidate);
                  }}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  <span className="font-medium">{candidate.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[candidate.email, description].filter(Boolean).join(" · ")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <Button
        type="button"
        data-testid="event-comment-post"
        disabled={saving || !body.trim()}
        onClick={() => void handleSubmit()}
      >
        {saving ? "Posting…" : "Post comment"}
      </Button>
    </div>
  );
}
