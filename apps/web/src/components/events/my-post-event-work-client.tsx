"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { EmptyState, ListSummary } from "@/components/list-page";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { PostEventWorkCard } from "@/components/events/post-event-work-card";

export function MyPostEventWorkClient() {
  const [now] = useState(() => Date.now());
  const rows = useQuery(api.crewPortal.listMyPostEventWork, { now });
  const needReview = rows?.filter((row) => !row.feedbackSubmitted).length ?? 0;
  const needMedia = rows?.filter((row) => !row.mediaResolved).length ?? 0;

  return (
    <div className="space-y-4 pb-24" data-testid="post-event-work-page">
      <PageHeader
        title="My post-event work"
        description="Events you worked that have ended. Leave a short review and add your photos and videos, or mark that you have none."
      />

      {rows === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState>Nothing waiting on you. Events you work show up here once they end.</EmptyState>
      ) : (
        <>
          <ListSummary testId="post-event-work-summary" order="Unfinished work first, then most recently ended.">
            {rows.length} event{rows.length === 1 ? "" : "s"} · {needReview} need
            {needReview === 1 ? "s" : ""} a review · {needMedia} need
            {needMedia === 1 ? "s" : ""} photos
          </ListSummary>
          {rows.map((row) => (
            <PostEventWorkCard key={row.eventId} row={row} />
          ))}
        </>
      )}
    </div>
  );
}
