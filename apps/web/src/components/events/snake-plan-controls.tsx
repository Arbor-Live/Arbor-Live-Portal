"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import type { PatchPlan } from "@arbor/show-file";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

/**
 * Which stage box each instrument group plugs into. Saved on the event, so the
 * patch views and the generated show file always agree.
 */
export function SnakePlanControls({
  eventId,
  plan,
  fitsOneBox,
}: {
  eventId: Id<"events">;
  plan: PatchPlan;
  /** False when the bill cannot fit on one stage box. */
  fitsOneBox: boolean;
}) {
  const savePlan = useMutation(api.eventPatchPlan.set);
  const [saving, setSaving] = useState(false);

  const save = async (next: PatchPlan) => {
    setSaving(true);
    try {
      await savePlan({ eventId, plan: next });
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not save the snake plan."));
    } finally {
      setSaving(false);
    }
  };

  const toggleSecondSnake = () => {
    // One snake is not an option when the bill cannot fit — the toggle only
    // ever turns the second box ON in that case.
    if (plan.secondSnake && !fitsOneBox) return;
    void save({ ...plan, secondSnake: !plan.secondSnake });
  };

  // One snake is only offered when the bill fits it. When it does not, the only
  // control is turning the second box on (or dropping an input).
  const oneSnakeOnly = fitsOneBox;
  const showToggle = fitsOneBox || !plan.secondSnake;

  const scopeScenes = plan.scopeScenes ?? true;

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="snake-plan-controls">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Snakes</p>
          <p className="text-xs text-muted-foreground">
            {!fitsOneBox
              ? "This bill needs more than one stage box. Drop an input or use two snakes."
              : plan.secondSnake
                ? "Both stage boxes out — families pack box A, and anything that does not fit continues on box B."
                : "One stage box (AES50 A). Turn on the second snake to split the stage."}
          </p>
        </div>
        {showToggle ? (
          <button
            type="button"
            onClick={toggleSecondSnake}
            disabled={saving}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              plan.secondSnake
                ? "bg-foreground text-background"
                : !oneSnakeOnly
                  ? "bg-amber/10 text-amber/90 hover:bg-amber/20"
                  : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {!oneSnakeOnly
              ? "Use two snakes"
              : plan.secondSnake
                ? "Two snakes"
                : "One snake"}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <p className="text-xs text-muted-foreground">
          {scopeScenes
            ? "Band scenes only recall channels that change — the kit keeps its soundcheck gain and EQ all night."
            : "Every band scene recalls the whole desk. Expect to re-gain between sets."}
        </p>
        <button
          type="button"
          onClick={() => void save({ ...plan, scopeScenes: !scopeScenes })}
          disabled={saving}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            scopeScenes
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {scopeScenes ? "Scene scoping on" : "Full recall"}
        </button>
      </div>
    </div>
  );
}
