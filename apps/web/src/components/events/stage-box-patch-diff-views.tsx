"use client";

import { useState } from "react";
import type { PatchDiffPlan } from "@arbor/show-file";
import { StageBoxPatchDiagram } from "@/components/events/stage-box-patch-diagram";
import { cn } from "@/lib/utils";

/**
 * Night patch (Default.snap layout) plus per-band changeover views.
 * Band tabs color the full faceplate: green same · mute strikethrough · yellow physical.
 */
export function StageBoxPatchDiffViews({ plan }: { plan: PatchDiffPlan }) {
  const tabs = [
    { id: "night", label: "Night patch" },
    ...plan.steps.map((step) => ({
      id: step.fileStem,
      label: step.bandName,
    })),
  ];
  const [active, setActive] = useState(tabs[0]?.id ?? "night");

  const activeStep = plan.steps.find((s) => s.fileStem === active);

  return (
    <div className="space-y-3" data-testid="stage-box-patch-diffs">
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active === tab.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "night" ? (
        <StageBoxPatchDiagram model={plan.night} />
      ) : activeStep ? (
        <StageBoxPatchDiagram
          model={{
            title: activeStep.bandName,
            subtitle: `vs ${activeStep.comparedTo}`,
            ports: activeStep.ports,
            warnings: plan.night.warnings,
          }}
          colored
        />
      ) : null}
    </div>
  );
}
