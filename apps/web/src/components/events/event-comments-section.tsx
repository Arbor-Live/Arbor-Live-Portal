"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  const deleteComment = useMutation(api.eventComments.deleteComment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [cursor, setCursor] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"eventComments"> | null>(null);

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

  // The menu is portaled out of the card, so it must not outlive textarea focus.
  const showMentionMenu = focused && Boolean(activeMention) && filteredMentions.length > 0;

  // The surrounding Card clips overflow, so the menu is portaled to the body and
  // anchored to the textarea with fixed coordinates instead of absolute ones.
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!showMentionMenu) return;

    function updatePosition() {
      const el = textareaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(96, Math.min(224, openUp ? spaceAbove : spaceBelow));
      setMenuPosition({
        top: openUp ? rect.top - 4 - maxHeight : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [showMentionMenu, filteredMentions.length]);

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

  async function handleDelete(commentId: Id<"eventComments">) {
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
    setDeletingId(commentId);
    setError(null);
    try {
      await deleteComment({ commentId });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete comment.");
    } finally {
      setDeletingId(null);
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
    <div
      className="space-y-3 rounded-md border p-4"
      data-testid="event-comments"
      data-mention-candidates={
        mentionCandidates === undefined ? "loading" : String(mentionCandidates.length)
      }
    >
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
              {comment.canDelete ? (
                <button
                  type="button"
                  data-testid="event-comment-delete"
                  className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-50"
                  disabled={deletingId === comment._id}
                  onClick={() => void handleDelete(comment._id)}
                >
                  {deletingId === comment._id ? "Deleting…" : "Delete"}
                </button>
              ) : null}
            </div>
            <p
              className="mt-1 text-sm break-words whitespace-pre-wrap"
              data-testid="event-comment-body"
            >
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onClick={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart)}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyDown={onTextareaKeyDown}
        />

        {showMentionMenu && menuPosition
          ? createPortal(
              <div
                className="z-[100] overflow-auto rounded-md border bg-popover p-1 shadow-md"
                style={{
                  position: "fixed",
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: menuPosition.width,
                  maxHeight: menuPosition.maxHeight,
                }}
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
                      className={`flex w-full min-w-0 flex-col rounded px-2 py-1.5 text-left text-sm ${
                        index === highlightIndex ? "bg-accent" : "hover:bg-muted/60"
                      }`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(candidate);
                      }}
                      onMouseEnter={() => setHighlightIndex(index)}
                    >
                      <span className="truncate font-medium">{candidate.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[candidate.email, description].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  );
                })}
              </div>,
              document.body,
            )
          : null}
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
