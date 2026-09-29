"use client";

import { useState } from "react";
import type { PatchDiffPlan } from "@arbor/show-file";
import { StageBoxPatchDiagram } from "@/components/events/stage-box-patch-diagram";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={active}
        onValueChange={(value) => {
          if (value) setActive(value);
        }}
        className="flex-wrap"
        aria-label="Patch view"
      >
        {tabs.map((tab) => (
          <ToggleGroupItem key={tab.id} value={tab.id}>
            {tab.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {active === "night" ? (
        <StageBoxPatchDiagram model={plan.night} />
      ) : activeStep ? (
        <StageBoxPatchDiagram
          model={{
            title: activeStep.bandName,
            subtitle: `vs ${activeStep.comparedTo}`,
            ports: activeStep.ports,
            spare: plan.night.spare,
            snakes: plan.night.snakes,
            warnings: plan.night.warnings,
          }}
          colored
        />
      ) : null}
    </div>
  );
}
