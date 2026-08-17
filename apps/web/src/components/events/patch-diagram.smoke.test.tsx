import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { allocateEventPatch, buildPatchDiffPlan, fileStem } from "@arbor/show-file";
import type { RiderInputChannel } from "@arbor/rider-document";
import { StageBoxPatchDiagram } from "./stage-box-patch-diagram";

const input = (
  p: Partial<RiderInputChannel> & Pick<RiderInputChannel, "id" | "channel" | "source">,
): RiderInputChannel => ({
  inputType: "mic",
  stand: "tall_boom",
  phantom: false,
  providedBy: "arbor",
  ...p,
});

const bands = [
  {
    bandName: "Openers",
    fileStem: fileStem("Openers"),
    role: "support" as const,
    inputs: [
      input({ id: "v", channel: 1, source: "Lead", sourceKey: "vox.lead" }),
      input({
        id: "k",
        channel: 2,
        source: "Nord",
        sourceKey: "keys",
        stereo: true,
        inputType: "di",
      }),
      input({ id: "kick", channel: 3, source: "Kick", sourceKey: "drum.kick" }),
      input({ id: "sax", channel: 4, source: "Sax", sourceKey: "wind.sax.tenor" }),
    ],
  },
];

/** Text content of the rendered faceplate, tags and all. */
function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("StageBoxPatchDiagram", () => {
  it("shows only the ports in use and lists the rest as leave-empty", () => {
    const plan = buildPatchDiffPlan(allocateEventPatch(bands), "Test Night");
    const rendered = text(renderToStaticMarkup(<StageBoxPatchDiagram model={plan.night} />));

    expect(rendered).toContain("A.1");
    expect(rendered).toContain("A.9");
    // Both halves of the stereo keys pair carry the same DI tag.
    expect(rendered).toContain("A.10");
    expect(rendered.match(/DI/g)).toHaveLength(2);
    // Spare mid ports are not drawn as empty cells.
    expect(rendered).not.toContain("A.6 ");
    expect(rendered).toContain("Leave empty");
  });

  it("groups two snakes and keeps the layout per box", () => {
    const allocation = allocateEventPatch(bands, {
      secondSnake: true,
      sides: { keys: "B", flex: "B" },
    });
    const plan = buildPatchDiffPlan(allocation, "Test Night");
    const step = plan.steps[0]!;
    const rendered = text(
      renderToStaticMarkup(
        <StageBoxPatchDiagram
          model={{
            title: step.bandName,
            subtitle: `vs ${step.comparedTo}`,
            ports: step.ports,
            spare: plan.night.spare,
            snakes: plan.night.snakes,
            warnings: plan.night.warnings,
          }}
          colored
        />,
      ),
    );

    expect(rendered).toContain("Snake A");
    expect(rendered).toContain("Snake B");
    expect(rendered).toContain("A.11"); // kick stays on A
    expect(rendered).toContain("B.9"); // keys moved to B
    expect(rendered).toContain("Ch 25"); // …on its own console strip
  });
});
