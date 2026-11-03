"use client";

import { StarIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <StarIcon
          key={value}
          className={cn(
            "size-4",
            value <= rating ? "text-status-amber-500" : "text-muted-foreground/30",
          )}
          weight={value <= rating ? "fill" : "regular"}
        />
      ))}
    </span>
  );
}

export function PostMortemAnswers({
  rating,
  peakTurnout,
  whatWentWell,
  whatCouldImprove,
}: {
  rating: number;
  peakTurnout?: number;
  whatWentWell?: string;
  whatCouldImprove?: string;
}) {
  return (
    <div className="space-y-3 text-sm">
      <RatingStars rating={rating} />
      {peakTurnout != null ? (
        <div className="space-y-1">
          <p className="font-medium">Peak turnout</p>
          <p className="text-muted-foreground">~{peakTurnout.toLocaleString()}</p>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-medium">What went well</p>
        <p className="whitespace-pre-wrap text-muted-foreground">{whatWentWell}</p>
      </div>
      <div className="space-y-1">
        <p className="font-medium">What could have gone better</p>
        <p className="whitespace-pre-wrap text-muted-foreground">{whatCouldImprove}</p>
      </div>
    </div>
  );
}
