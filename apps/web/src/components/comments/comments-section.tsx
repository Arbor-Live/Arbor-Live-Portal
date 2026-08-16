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
import { TrashIcon } from "@phosphor-icons/react";
import { UserAvatar } from "@/components/account/user-avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { notify } from "@/lib/notify";
import { PORTAL_TIMEZONE } from "@/lib/format";
import { fuzzyScoreHaystack } from "@/lib/fuzzy-match";

/** Threads are keyed by subject, so a new surface only adds a literal here. */
export type CommentSubjectType = "event" | "damage_batch" | "event_request";

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

function formatCommentTime(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

const COMMENT_TIME_COLLAPSE_MS = 2 * 60 * 1000;

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

export type CommentsSectionProps = {
  subjectType: CommentSubjectType;
  subjectId: string;
  title?: string;
  description?: ReactNode;
  /**
   * Where to portal the mention typeahead. Defaults to `document.body`, which a
   * modal Radix layer blocks from receiving pointer events — inside a dialog or
   * sheet, pass that layer's element so the menu stays clickable.
   */
  menuContainer?: HTMLElement | null;
};

export function CommentsSection(props: CommentsSectionProps) {
  return (
    <ArborOnlyGuard>
      <CommentsPanel {...props} />
    </ArborOnlyGuard>
  );
}

function CommentsPanel({
  subjectType,
  subjectId,
  title = "Comments",
  description,
  menuContainer,
}: CommentsSectionProps) {
  const comments = useQuery(api.comments.listBySubject, { subjectType, subjectId });
  const mentionCandidates = useQuery(api.comments.listMentionCandidates, {});
  const createComment = useMutation(api.comments.createComment);
  const deleteComment = useMutation(api.comments.deleteComment);
  const { confirm } = useAppDialog();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [cursor, setCursor] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"comments"> | null>(null);

  const commentGroups = useMemo(() => {
    const groups: NonNullable<typeof comments>[] = [];
    for (const comment of comments ?? []) {
      const lastGroup = groups[groups.length - 1];
      const lastComment = lastGroup?.[lastGroup.length - 1];
      if (lastComment && lastComment.authorEmail === comment.authorEmail) {
        lastGroup.push(comment);
      } else {
        groups.push([comment]);
      }
    }
    return groups;
  }, [comments]);

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

  // The surrounding Card clips overflow, so the menu is portaled out and anchored
  // to the textarea by coordinate. Portaled to the body it can stay `fixed`, but
  // inside a container it must be `absolute` — a Radix sheet animates with a
  // transform, which would make `fixed` resolve against the sheet, not the
  // viewport.
  const [menuPosition, setMenuPosition] = useState<{
    position: "fixed" | "absolute";
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
      const top = openUp ? rect.top - 4 - maxHeight : rect.bottom + 4;

      if (!menuContainer) {
        setMenuPosition({ position: "fixed", top, left: rect.left, width: rect.width, maxHeight });
        return;
      }

      const containerRect = menuContainer.getBoundingClientRect();
      setMenuPosition({
        position: "absolute",
        top: top - containerRect.top + menuContainer.scrollTop,
        left: rect.left - containerRect.left + menuContainer.scrollLeft,
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
  }, [showMentionMenu, filteredMentions.length, menuContainer]);

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
    try {
      await createComment({
        subjectType,
        subjectId,
        body,
        mentionedUserIds: extractMentionedUserIds(body, candidates),
      });
      setBody("");
      setCursor(0);
      setHighlightIndex(0);
    } catch (submitError) {
      notify.error(submitError instanceof Error ? submitError.message : "Failed to post comment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(commentId: Id<"comments">) {
    const shouldDelete = await confirm({
      title: "Delete this comment?",
      description: "This cannot be undone.",
      destructive: true,
    });
    if (!shouldDelete) return;
    setDeletingId(commentId);
    try {
      await deleteComment({ commentId });
    } catch (deleteError) {
      notify.error(deleteError instanceof Error ? deleteError.message : "Failed to delete comment.");
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
      data-testid="comments"
      data-comment-subject-type={subjectType}
      data-mention-candidates={
        mentionCandidates === undefined ? "loading" : String(mentionCandidates.length)
      }
    >
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {description ?? (
            <>
              Type <span className="font-medium">@</span> to mention a teammate — they get an
              email.
            </>
          )}
        </p>
      </div>

      <div className="space-y-3">
        {commentGroups.map((group) => (
          <MessageGroup key={group[0]?._id}>
            {group.map((comment, index) => {
              const lastInGroup = index === group.length - 1;
              const nextComment = group[index + 1];
              const showTime =
                !nextComment ||
                nextComment.createdAt - comment.createdAt > COMMENT_TIME_COLLAPSE_MS;
              const isOwn = comment.canDelete;
              return (
                <Message
                  key={comment._id}
                  align={isOwn ? "end" : "start"}
                  data-testid="comment-row"
                >
                  <MessageAvatar>
                    {lastInGroup ? (
                      <UserAvatar
                        name={comment.authorName}
                        email={comment.authorEmail}
                        size="sm"
                      />
                    ) : null}
                  </MessageAvatar>
                  <MessageContent>
                    {!isOwn && index === 0 ? (
                      <MessageHeader>{comment.authorName}</MessageHeader>
                    ) : null}
                    <Bubble variant={isOwn ? "default" : "muted"}>
                      <BubbleContent
                        className="text-sm break-words whitespace-pre-wrap"
                        data-testid="comment-body"
                      >
                        {renderBodyWithMentions(
                          comment.body,
                          comment.mentionedUsers.map((user) => user.name),
                        )}
                      </BubbleContent>
                    </Bubble>
                    {showTime || isOwn ? (
                      <MessageFooter className="gap-1">
                        {showTime ? <span>{formatCommentTime(comment.createdAt)}</span> : null}
                        {isOwn ? (
                          <button
                            type="button"
                            data-testid="comment-delete"
                            aria-label="Delete"
                            className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 hover:text-destructive focus-visible:opacity-100 disabled:opacity-50"
                            disabled={deletingId === comment._id}
                            onClick={() => void handleDelete(comment._id)}
                          >
                            <TrashIcon className="size-3.5" />
                          </button>
                        ) : null}
                      </MessageFooter>
                    ) : null}
                  </MessageContent>
                </Message>
              );
            })}
          </MessageGroup>
        ))}
        {comments && comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        ) : null}
      </div>

      <div className="relative space-y-2">
        <textarea
          ref={textareaRef}
          data-testid="comment-input"
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
                  position: menuPosition.position,
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: menuPosition.width,
                  maxHeight: menuPosition.maxHeight,
                  // A modal Radix layer sets pointer-events:none on everything
                  // outside its content; the menu must opt back in.
                  pointerEvents: "auto",
                }}
                role="listbox"
                data-testid="comment-mention-menu"
              >
                {filteredMentions.map((candidate, index) => {
                  const candidateDescription = [
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
                        {[candidate.email, candidateDescription].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  );
                })}
              </div>,
              menuContainer ?? document.body,
            )
          : null}
      </div>

      <Button
        type="button"
        data-testid="comment-post"
        disabled={saving || !body.trim()}
        onClick={() => void handleSubmit()}
      >
        {saving ? "Posting…" : "Post comment"}
      </Button>
    </div>
  );
}
