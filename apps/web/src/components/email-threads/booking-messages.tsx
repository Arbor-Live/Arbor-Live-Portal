"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { CopyIcon, EnvelopeSimpleIcon, PaperclipIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { EmptyState } from "@/components/list-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { emailSummaryToast } from "@/lib/email-summary-toast";
import { formatDateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export type BookingMessagesRecord =
  | { requestId: Id<"eventRequests"> }
  | { invoiceId: Id<"invoices"> }
  | { eventId: Id<"events"> };

/** A reply longer than this collapses behind "Show more". */
const COLLAPSE_CHARS = 600;
const COLLAPSE_LINES = 10;
/** Mirrors `MAX_REPLY_CHARS` in `packages/backend/convex/emailThreads.ts`, which refuses longer replies. */
const MAX_REPLY_CHARS = 10_000;

type Thread = NonNullable<ReturnType<typeof useBookingThread>>;
type Message = Thread["messages"][number];
type FailedReply = Thread["failedReplies"][number];

function useBookingThread(record: BookingMessagesRecord) {
  return useQuery(api.emailThreads.getForRecord, record);
}

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address);
    notify.success("Booking address copied.");
  } catch {
    notify.error("Could not copy the booking address.");
  }
}

function MessageBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > COLLAPSE_CHARS || text.split("\n").length > COLLAPSE_LINES;
  return (
    <div className="space-y-1">
      <p
        className={cn(
          "text-sm break-words whitespace-pre-wrap",
          long && !expanded && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {long ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto px-0"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}

function MakeChangeRequestButton({ messageId }: { messageId: Message["_id"] }) {
  const makeChangeRequest = useMutation(api.emailThreads.makeChangeRequest);
  const { confirm } = useAppDialog();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    const confirmed = await confirm({
      title: "Make this a change request?",
      description: "The quote goes back to changes requested, with this message as the note.",
      confirmLabel: "Make change request",
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await makeChangeRequest({ messageId });
      notify.success("Change request created.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not create the change request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => void onClick()}
      data-testid={`make-change-request-${messageId}`}
    >
      Make this a change request
    </Button>
  );
}

function FailedReplyRow({ reply, canRetry }: { reply: FailedReply; canRetry: boolean }) {
  const retryReply = useMutation(api.emailThreads.retryReply);
  const [busy, setBusy] = useState(false);

  async function onRetry() {
    setBusy(true);
    try {
      await retryReply({ notificationId: reply._id });
      notify.success("Reply queued again.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not try the reply again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className="space-y-1.5 border-l-2 border-l-destructive/60 bg-destructive/5 px-3 py-3"
      data-testid="booking-failed-reply"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="destructive">Not sent</Badge>
          <span className="truncate text-xs text-muted-foreground">To {reply.to}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(reply.createdAt)}
        </span>
      </div>
      <p className="text-sm break-words whitespace-pre-wrap line-clamp-4">{reply.bodyPreview}</p>
      <p className="text-xs break-words text-destructive">{reply.error}</p>
      {canRetry ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void onRetry()}
          data-testid="retry-failed-reply"
        >
          Try again
        </Button>
      ) : null}
    </li>
  );
}

function AddSummaryButton({ eventId }: { eventId: Id<"events"> }) {
  const addSummary = useAction(api.bookingSummary.addSummaryToEventNotes);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const toast = emailSummaryToast(await addSummary({ eventId }));
      if (toast.kind === "success") notify.success(toast.message);
      else notify.info(toast.message);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not add the summary."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      disabled={busy}
      onClick={() => void onClick()}
      data-testid="add-email-summary"
    >
      Add summary to notes
    </Button>
  );
}

function MessageRow({ message, readOnly }: { message: Message; readOnly: boolean }) {
  const named = Boolean(message.fromName);
  const outbound = message.direction === "outbound";
  return (
    <li
      className={cn(
        "space-y-1.5 px-3 py-3",
        outbound && "border-l-2 border-l-primary/50 bg-muted/40",
      )}
      data-testid="booking-message"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">
            {message.fromName ?? message.fromEmail}
          </span>
          {named ? (
            <span className="truncate text-xs text-muted-foreground">{message.fromEmail}</span>
          ) : null}
          {!outbound && message.matchedBy === "address" && !message.fromClient ? (
            <Badge variant="secondary">CC-linked</Badge>
          ) : null}
          {message.changeRequestedAt ? <Badge variant="secondary">Change request</Badge> : null}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(message.receivedAt)}
        </span>
      </div>
      {outbound && message.to?.length ? (
        <p className="truncate text-xs text-muted-foreground">To {message.to.join(", ")}</p>
      ) : null}
      <MessageBody text={message.bodyText} />
      {message.attachments.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <PaperclipIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {message.attachments.map((attachment) => attachment.filename).join(", ")}
          </span>
        </p>
      ) : null}
      {message.canMakeChangeRequest && !readOnly ? (
        <MakeChangeRequestButton messageId={message._id} />
      ) : null}
    </li>
  );
}

/** Addresses typed into the CC box: commas, semicolons or spaces between them. */
function parseCc(value: string) {
  return value
    .split(/[,;\s]+/)
    .map((address) => address.trim())
    .filter(Boolean);
}

function ReplyComposer(props: {
  record: BookingMessagesRecord;
  clientEmail: string;
  canAttachQuote: boolean;
}) {
  const sendReply = useMutation(api.emailThreads.sendReply);
  const [body, setBody] = useState("");
  const [cc, setCc] = useState("");
  const [attachQuote, setAttachQuote] = useState(false);
  const [sending, setSending] = useState(false);
  // One id per attempt: a double click or a retry after a dropped connection queues one email.
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  async function onSend() {
    if (sending || !body.trim()) return;
    setSending(true);
    try {
      await sendReply({
        ...props.record,
        body,
        attachQuote: props.canAttachQuote && attachQuote,
        cc: parseCc(cc),
        clientRequestId,
      });
      setClientRequestId(crypto.randomUUID());
      setBody("");
      setCc("");
      setAttachQuote(false);
      notify.success("Reply queued.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not send the reply."));
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="mt-4 space-y-3"
      data-testid="booking-reply"
      onSubmit={(event) => {
        event.preventDefault();
        void onSend();
      }}
    >
      <p className="text-sm" data-testid="booking-reply-to">
        <span className="text-muted-foreground">To</span> {props.clientEmail}
      </p>
      <div className="space-y-2">
        <Label htmlFor="booking-reply-cc">CC</Label>
        <Input
          id="booking-reply-cc"
          value={cc}
          onChange={(event) => setCc(event.target.value)}
          onKeyDown={(event) => {
            // Enter in a single-line field would otherwise send the whole reply.
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder="name@example.com"
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="booking-reply-body">Message</Label>
        <Textarea
          id="booking-reply-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_REPLY_CHARS}
          className="min-h-28"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {props.canAttachQuote ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="booking-reply-attach-quote"
              checked={attachQuote}
              onCheckedChange={(value) => setAttachQuote(value === true)}
            />
            <Label htmlFor="booking-reply-attach-quote">Attach current quote</Label>
          </div>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm" disabled={sending || !body.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}

/**
 * The booking's email conversation and the reply box. The request, its invoice
 * and its event all show the same thread (see `emailThreads.getForRecord`).
 * `readOnly` hides everything that sends or changes the booking.
 */
export function BookingMessages(props: { record: BookingMessagesRecord; readOnly?: boolean }) {
  const readOnly = props.readOnly ?? false;
  const data = useBookingThread(props.record);

  return (
    <Card data-testid="booking-messages">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <EnvelopeSimpleIcon className="size-4 text-muted-foreground" aria-hidden />
          Email
          {data && data.thread && data.thread.messageCount > data.messages.length ? (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              Latest {data.messages.length} of {data.thread.messageCount}
            </span>
          ) : null}
        </CardTitle>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {"eventId" in props.record &&
          !readOnly &&
          data?.messages.some((message) => message.direction === "inbound") ? (
            <AddSummaryButton eventId={props.record.eventId} />
          ) : null}
          {data?.address ? (
            <div className="flex min-w-0 items-center gap-1">
              <code
                className="min-w-0 truncate text-xs text-muted-foreground"
                data-testid="booking-address"
              >
                {data.address}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Copy booking address"
                onClick={() => void copyAddress(data.address!)}
              >
                <CopyIcon aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : data.messages.length === 0 && data.failedReplies.length === 0 ? (
          <EmptyState>No emails yet.</EmptyState>
        ) : (
          <ul className="divide-y border">
            {data.messages.map((message) => (
              <MessageRow
                key={message._id}
                message={message}
                readOnly={readOnly || !data.canReply}
              />
            ))}
            {data.failedReplies.map((reply) => (
              <FailedReplyRow
                key={reply._id}
                reply={reply}
                canRetry={data.canReply && !readOnly}
              />
            ))}
          </ul>
        )}
        {data && data.clientEmail && data.canReply && !readOnly ? (
          <ReplyComposer
            record={props.record}
            clientEmail={data.clientEmail}
            canAttachQuote={data.canAttachQuote}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
