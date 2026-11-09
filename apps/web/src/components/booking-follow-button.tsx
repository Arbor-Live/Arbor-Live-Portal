"use client";

import { BellIcon, BellRingingIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

export type BookingFollowTarget =
  | { kind: "request"; requestId: Id<"eventRequests"> }
  | { kind: "invoice"; invoiceId: Id<"invoices"> }
  | { kind: "event"; eventId: Id<"events"> };

/** Follows the whole booking the record belongs to. Hidden for anyone who is not staff. */
export function FollowButton({ target }: { target: BookingFollowTarget }) {
  const isFollowing = useQuery(api.bookingFollows.isFollowing, { target });
  const follow = useMutation(api.bookingFollows.follow);
  const unfollow = useMutation(api.bookingFollows.unfollow);
  const [pending, setPending] = useState(false);

  if (isFollowing === undefined || isFollowing === null) return null;

  async function toggle() {
    setPending(true);
    try {
      if (isFollowing) {
        await unfollow({ target });
        notify.success("Unfollowed this booking");
      } else {
        await follow({ target });
        notify.success("Following this booking");
      }
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={isFollowing}
      disabled={pending}
      onClick={() => void toggle()}
      data-testid="follow-button"
    >
      {isFollowing ? <BellRingingIcon weight="fill" className="text-primary" /> : <BellIcon />}
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
