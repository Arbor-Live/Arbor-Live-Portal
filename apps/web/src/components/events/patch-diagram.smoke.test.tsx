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

    // One box, so ports read as printed on it: no socket brackets.
    expect(rendered).toContain("Vox · 1–4");
    expect(rendered).toContain("Mid · 5–10");
    expect(rendered).toContain("Drums · 11–16");
    // Both halves of the stereo keys pair carry the same DI tag.
    expect(rendered.match(/DI/g)).toHaveLength(2);
    // Sax takes Flex1; Flex2 is spare, so it is not drawn as an empty cell.
    expect(rendered).toContain("Flex1");
    expect(rendered).not.toContain("Flex2");
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
    // Box A carries only vox here, box B the keys and flex.
    expect(rendered).toContain("Vox · 1–4");
    expect(rendered).toContain("Mid · 5–10 (21–26)"); // box B, sockets alongside
    expect(rendered).toContain("9 (25)"); // keys: port 9 on box B = socket A.25
    expect(rendered).toContain("Ch 25"); // …on its own console strip
    expect(rendered).not.toContain("B.9"); // never AES50 B
  });
});
