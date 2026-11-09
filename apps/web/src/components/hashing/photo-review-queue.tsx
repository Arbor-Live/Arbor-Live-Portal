"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { plural } from "@/lib/format";
import { hashDayLabel, PHOTO_LEVEL_LABELS } from "@/lib/hashing";
import { notify } from "@/lib/notify";

export function PhotoReviewQueue() {
  const pending = useQuery(api.hashingPhotos.listPending, {});
  const approve = useMutation(api.hashingPhotos.approve);
  const reject = useMutation(api.hashingPhotos.reject);
  const [busyId, setBusyId] = useState<Id<"hashReferencePhotos"> | null>(null);

  if (!pending || pending.length === 0) return null;

  async function decide(photoId: Id<"hashReferencePhotos">, action: typeof approve, done: string, failed: string) {
    setBusyId(photoId);
    try {
      await action({ photoId });
      notify.success(done);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, failed));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-2 border p-3" data-testid="hash-photo-queue">
      <h2 className="flex items-center gap-2 font-medium">
        Photos to review
        <span className="bg-status-amber-500/15 px-1.5 text-xs text-status-amber-700 tabular-nums dark:text-status-amber-200">
          {pending.length}
        </span>
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pending.map((photo) => (
          <li key={photo._id} className="flex min-w-0 flex-col border" data-testid="hash-photo-review">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="aspect-4/3 w-full object-cover" />
            <div className="flex-1 space-y-1 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">{PHOTO_LEVEL_LABELS[photo.level]}</p>
              <p className="text-sm break-words">{photo.title}</p>
              {photo.context ? <p className="text-xs break-words text-muted-foreground">{photo.context}</p> : null}
              <p className="text-xs text-muted-foreground">
                {[
                  photo.byName,
                  photo.dateKey ? hashDayLabel(photo.dateKey) : null,
                  photo.approvedCount > 0 ? `${plural(photo.approvedCount, "photo")} already` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="grid grid-cols-2 border-t">
              <button
                type="button"
                className="h-11 border-r text-sm hover:bg-muted/40 disabled:opacity-50"
                disabled={busyId === photo._id}
                data-testid="hash-photo-reject"
                onClick={() => void decide(photo._id, reject, "Photo rejected.", "Couldn't reject that photo.")}
              >
                Reject
              </button>
              <button
                type="button"
                className="h-11 text-sm font-medium hover:bg-muted/40 disabled:opacity-50"
                disabled={busyId === photo._id}
                data-testid="hash-photo-approve"
                onClick={() => void decide(photo._id, approve, "Photo approved.", "Couldn't approve that photo.")}
              >
                Approve
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
