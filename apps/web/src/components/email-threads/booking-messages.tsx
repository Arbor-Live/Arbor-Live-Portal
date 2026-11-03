"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CopyIcon, EnvelopeSimpleIcon, PaperclipIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { EmptyState } from "@/components/list-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

type Message = NonNullable<ReturnType<typeof useBookingThread>>["messages"][number];

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

function MessageRow({ message }: { message: Message }) {
  const named = Boolean(message.fromName);
  return (
    <li className="space-y-1.5 px-3 py-3" data-testid="booking-message">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">
            {message.fromName ?? message.fromEmail}
          </span>
          {named ? (
            <span className="truncate text-xs text-muted-foreground">{message.fromEmail}</span>
          ) : null}
          {message.matchedBy === "address" && !message.fromClient ? (
            <Badge variant="secondary">CC-linked</Badge>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(message.receivedAt)}
        </span>
      </div>
      <MessageBody text={message.bodyText} />
      {message.attachments.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <PaperclipIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {message.attachments.map((attachment) => attachment.filename).join(", ")}
          </span>
        </p>
      ) : null}
    </li>
  );
}

/**
 * The booking's email conversation, read-only. The request, its invoice and its
 * event all show the same thread (see `emailThreads.getForRecord`).
 */
export function BookingMessages(props: { record: BookingMessagesRecord }) {
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
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : data.messages.length === 0 ? (
          <EmptyState>No emails yet.</EmptyState>
        ) : (
          <ul className="divide-y border">
            {data.messages.map((message) => (
              <MessageRow key={message._id} message={message} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
