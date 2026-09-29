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

/** A bill that needs a second box: box A fills 16 sockets, box B takes the OH pair. */
const bigBands = [
  {
    bandName: "Big Band",
    fileStem: fileStem("Big Band"),
    role: "headliner" as const,
    inputs: [
      ...Array.from({ length: 4 }, (_, i) =>
        input({ id: `v${i}`, channel: i + 1, source: `V${i}`, sourceKey: "vox.lead" }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        input({
          id: `f${i}`,
          channel: 5 + i,
          source: `Horn ${i}`,
          sourceKey: "wind.trumpet",
        }),
      ),
      input({ id: "k", channel: 11, source: "Keys", sourceKey: "keys", stereo: true, inputType: "di" }),
      input({ id: "kick", channel: 12, source: "Kick", sourceKey: "drum.kick" }),
      input({ id: "sn", channel: 13, source: "Snare", sourceKey: "drum.snare" }),
      input({ id: "t1", channel: 14, source: "Rack", sourceKey: "drum.tom.rack" }),
      input({ id: "t2", channel: 15, source: "Floor", sourceKey: "drum.tom.floor" }),
      input({ id: "oh", channel: 16, source: "OH", sourceKey: "drum.oh", stereo: true }),
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

    // No fixed family bands: ports pack in the allocator's order, and each cell
    // carries its own socket, so the stale "Vox / Mid / Drums" headers are gone.
    expect(rendered).not.toContain("Vox ·");
    // Both halves of the stereo keys pair carry the same DI tag.
    expect(rendered.match(/DI/g)).toHaveLength(2);
    // Only ports in use are drawn, wearing the rider's own names; spares are
    // listed, never drawn as cells.
    expect(rendered).toContain("Sax");
    expect(rendered).toContain("Nord");
    expect(rendered).toContain("Leave empty");
  });

  it("groups two snakes and keeps the layout per box", () => {
    const allocation = allocateEventPatch(bigBands, {
      secondSnake: true,
      // `sides` is UI intent only: placement is order-driven, so the overflow
      // still lands on box B regardless.
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
    // No fixed family bands anywhere.
    expect(rendered).not.toContain("Vox ·");
    expect(rendered).not.toContain("Drums ·");
    // Box B's overflow reads as printed on the box, with the desk's sockets
    // alongside — and those sockets are AES50 A, never "B".
    expect(rendered).toContain("1 (17)");
    expect(rendered).toContain("2 (18)");
    expect(rendered).not.toContain("B.9");
    expect(rendered).not.toContain("B.1");
  });
});
