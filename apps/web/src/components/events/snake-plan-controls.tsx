"use client";

import { useMutation } from "convex/react";
import type { PatchPlan, SnakeGroup, SnakeId } from "@arbor/show-file";
import { SNAKE_GROUPS, SNAKE_GROUP_LABEL, SNAKE_SHORT_LABEL } from "@arbor/show-file";
import { api, type Id } from "@/lib/convex-api";
import { cn } from "@/lib/utils";

const SNAKE_IDS: SnakeId[] = ["A", "B"];

/**
 * Which stage box each instrument group plugs into. Saved on the event, so the
 * patch views and the generated show file always agree.
 */
export function SnakePlanControls({
  eventId,
  plan,
}: {
  eventId: Id<"events">;
  plan: PatchPlan;
}) {
  const savePlan = useMutation(api.eventPatchPlan.set);

  const save = (next: PatchPlan) => {
    void savePlan({ eventId, plan: next });
  };

  const toggleSecondSnake = () => {
    save(
      plan.secondSnake
        ? { ...plan, secondSnake: false, sides: {} }
        : { ...plan, secondSnake: true },
    );
  };

  const setSide = (group: SnakeGroup, snake: SnakeId) => {
    save({ ...plan, secondSnake: true, sides: { ...plan.sides, [group]: snake } });
  };

  const scopeScenes = plan.scopeScenes ?? true;

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="snake-plan-controls">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Snakes</p>
          <p className="text-xs text-muted-foreground">
            {plan.secondSnake
              ? "Both stage boxes out — pick a side per instrument. Anything that overflows moves to the other box automatically."
              : "One stage box (AES50 A). Turn on the second snake to split the stage."}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleSecondSnake}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            plan.secondSnake
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {plan.secondSnake ? "Two snakes" : "One snake"}
        </button>
      </div>

      {plan.secondSnake ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SNAKE_GROUPS.map((group) => (
            <div
              key={group}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
            >
              <span className="text-xs">{SNAKE_GROUP_LABEL[group]}</span>
              <div className="flex gap-1">
                {SNAKE_IDS.map((snake) => {
                  const active = (plan.sides[group] ?? "A") === snake;
                  return (
                    <button
                      key={snake}
                      type="button"
                      onClick={() => setSide(group, snake)}
                      aria-pressed={active}
                      className={cn(
                        "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                        active
                          ? "bg-foreground text-background"
                          : "bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {SNAKE_SHORT_LABEL[snake]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <p className="text-xs text-muted-foreground">
          {scopeScenes
            ? "Band scenes only recall channels that change — the kit keeps its soundcheck gain and EQ all night."
            : "Every band scene recalls the whole desk. Expect to re-gain between sets."}
        </p>
        <button
          type="button"
          onClick={() => save({ ...plan, scopeScenes: !scopeScenes })}
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
