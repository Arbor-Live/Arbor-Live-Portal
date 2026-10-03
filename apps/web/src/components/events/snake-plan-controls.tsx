"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import type { PatchPlan } from "@arbor/show-file";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * Which stage box each instrument group plugs into. Saved on the event, so the
 * patch views and the generated show file always agree.
 */
export function SnakePlanControls({
  eventId,
  plan,
  fitsOneBox,
  monoToFit = [],
}: {
  eventId: Id<"events">;
  plan: PatchPlan;
  /** False when the bill cannot fit on one stage box. */
  fitsOneBox: boolean;
  /** Stereo inputs one box breaks to mono to seat the bill. */
  monoToFit?: string[];
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

  const scopeScenes = plan.scopeScenes ?? true;

  return (
    <section className="space-y-3" data-testid="snake-plan-controls">
      <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        Stage setup
      </h3>

      <div className="divide-y border">
        <div className="flex flex-wrap items-start justify-between gap-3 p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Stage boxes</p>
            <p className="text-xs text-muted-foreground">
              {!fitsOneBox
                ? "This bill needs more than one stage box. Drop an input or use two snakes."
                : plan.secondSnake
                  ? "Both stage boxes out — families pack box A, and anything that does not fit continues on box B."
                  : monoToFit.length > 0
                    ? `One stage box (AES50 A) — ${monoToFit.join(", ")} runs mono to fit. Turn on the second snake to keep it stereo.`
                    : "One stage box (AES50 A). Turn on the second snake to split the stage."}
            </p>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={plan.secondSnake ? "two" : "one"}
            onValueChange={(value) => {
              if (!value) return;
              void save({ ...plan, secondSnake: value === "two" });
            }}
            disabled={saving}
            aria-label="Stage boxes"
          >
            {/* One snake is not an option when the bill cannot fit it. */}
            <ToggleGroupItem value="one" disabled={!fitsOneBox}>
              One snake
            </ToggleGroupItem>
            <ToggleGroupItem value="two">Two snakes</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3 p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Scene recall</p>
            <p className="text-xs text-muted-foreground">
              {scopeScenes
                ? "Band scenes only recall channels that change — the kit keeps its soundcheck gain and EQ all night."
                : "Every band scene recalls the whole desk. Expect to re-gain between sets."}
            </p>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={scopeScenes ? "scoped" : "full"}
            onValueChange={(value) => {
              if (!value) return;
              void save({ ...plan, scopeScenes: value === "scoped" });
            }}
            disabled={saving}
            aria-label="Scene recall"
          >
            <ToggleGroupItem value="scoped">Scene scoping</ToggleGroupItem>
            <ToggleGroupItem value="full">Full recall</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </section>
  );
}
