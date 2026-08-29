"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
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
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { ArborOnlyGuard } from "@/components/org-context-guard";
import { notify } from "@/lib/notify";
import { PORTAL_TIMEZONE } from "@/lib/format";
import { buildUserSelectDescription } from "@/lib/user-select-description";

/** Threads are keyed by subject, so a new surface only adds a literal here. */
export type CommentSubjectType = "event" | "damage_batch" | "event_request";

type MentionCandidate = {
  userId: string;
  name: string;
  email: string;
  username?: string;
  pronouns?: string;
  gradYear?: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Prefer @username; fall back to display name for people who have not set one. */
function mentionHandle(candidate: Pick<MentionCandidate, "username" | "name">) {
  return candidate.username || candidate.name;
}

/** True when `@handle` appears as its own token (not inside a larger identifier). */
function handleAppearsInBody(body: string, handle: string) {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])@${escapeRegExp(handle)}(?![\\p{L}\\p{N}_])`,
    "gu",
  );
  return pattern.test(body);
}

function extractMentionedUserIds(
  body: string,
  candidates: MentionCandidate[],
  preferredUserIds: string[] = [],
): string[] {
  const preferred = new Set(preferredUserIds);
  const byHandle = new Map<string, MentionCandidate[]>();
  for (const candidate of candidates) {
    for (const handle of [candidate.username, candidate.name].filter(
      (value): value is string => Boolean(value),
    )) {
      const group = byHandle.get(handle) ?? [];
      group.push(candidate);
      byHandle.set(handle, group);
    }
  }

  // Longer handles first so `@jane_doe` wins over `@jane`.
  const handles = [...byHandle.keys()].sort((a, b) => b.length - a.length);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const handle of handles) {
    if (!handleAppearsInBody(body, handle)) continue;
    const group = byHandle.get(handle) ?? [];
    // Prefer an explicitly picked user, then a username match, then first hit.
    const pick =
      group.find((candidate) => preferred.has(candidate.userId)) ??
      group.find((candidate) => candidate.username === handle) ??
      group[0];
    if (!pick || seen.has(pick.userId)) continue;
    ids.push(pick.userId);
    seen.add(pick.userId);
  }
  return ids;
}

/**
 * Prefer picker-selected users (even when two people share a handle), then
 * parse any manually typed @mentions from the body.
 */
function resolveMentionedUserIds(
  body: string,
  candidates: MentionCandidate[],
  preferredUserIds: string[],
): string[] {
  const byId = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const userId of preferredUserIds) {
    const candidate = byId.get(userId);
    if (!candidate) continue;
    if (!handleAppearsInBody(body, mentionHandle(candidate))) continue;
    if (seen.has(userId)) continue;
    ids.push(userId);
    seen.add(userId);
  }

  for (const userId of extractMentionedUserIds(body, candidates, preferredUserIds)) {
    if (seen.has(userId)) continue;
    ids.push(userId);
    seen.add(userId);
  }
  return ids;
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

function renderBodyWithMentions(
  body: string,
  mentioned: { name: string; username?: string }[],
): ReactNode {
  const handles = [
    ...new Set(
      mentioned.flatMap((user) => [user.username, user.name].filter(Boolean) as string[]),
    ),
  ].sort((a, b) => b.length - a.length);
  if (!handles.length) return body;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])@(?:${handles.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`,
    "gu",
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
}: CommentsSectionProps) {
  const comments = useQuery(api.comments.listBySubject, { subjectType, subjectId });
  const mentionCandidates = useQuery(api.comments.listMentionCandidates, {});
  const createComment = useMutation(api.comments.createComment);
  const deleteComment = useMutation(api.comments.deleteComment);
  const { confirm } = useAppDialog();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [cursor, setCursor] = useState(0);
  const [mentionPickerKey, setMentionPickerKey] = useState(0);
  /** User IDs chosen via the picker — wins over ambiguous @handle parsing. */
  const [draftMentionedUserIds, setDraftMentionedUserIds] = useState<string[]>([]);
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
  const candidatesById = useMemo(
    () => new Map(candidates.map((row) => [row.userId, row])),
    [candidates],
  );
  const mentionOptions: UserSelectOption[] = useMemo(
    () =>
      candidates.map((row) => ({
        value: row.userId,
        label: row.name,
        email: row.email,
        description: buildUserSelectDescription({
          role: row.username ? `@${row.username}` : undefined,
          email: row.email,
          pronouns: row.pronouns,
          gradYear: row.gradYear,
        }),
        keywords: [row.username, row.email].filter(Boolean).join(" "),
      })),
    [candidates],
  );

  function insertMention(userId: string) {
    const candidate = candidatesById.get(userId);
    if (!candidate) return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? cursor;
    const end = el?.selectionEnd ?? cursor;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const needsSpaceBefore = before.length > 0 && !/\s$/.test(before);
    const insertion = `${needsSpaceBefore ? " " : ""}@${mentionHandle(candidate)} `;
    const nextBody = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    setBody(nextBody);
    setCursor(nextCursor);
    setDraftMentionedUserIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
    setMentionPickerKey((key) => key + 1);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      await createComment({
        subjectType,
        subjectId,
        body,
        mentionedUserIds: resolveMentionedUserIds(body, candidates, draftMentionedUserIds),
      });
      setBody("");
      setCursor(0);
      setDraftMentionedUserIds([]);
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
          {description ?? <>Mention a teammate — they get an email.</>}
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
                        userId={comment.authorUserId}
                        imageUrl={comment.authorAvatarUrl}
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
                        {renderBodyWithMentions(comment.body, comment.mentionedUsers)}
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

      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          data-testid="comment-input"
          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Write a comment…"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setCursor(e.target.selectionStart);
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart)}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        />
        <div data-testid="comment-mention-picker">
          <UserSelect
            key={mentionPickerKey}
            value=""
            onChange={insertMention}
            options={mentionOptions}
            placeholder="Search teammates…"
            emptyLabel="Mention someone…"
          />
        </div>
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
