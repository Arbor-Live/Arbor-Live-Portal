import { describe, expect, it } from "vitest";
import { positionDraftsToTemplates, positionTemplatesToDrafts } from "./event-series-positions";

const MINUTE = 60_000;

describe("position template draft round trip", () => {
  it("keeps offsets that fall between two-decimal hours (20, 40, 50, 10 minutes)", () => {
    for (const minutes of [10, 20, 40, 50, 130]) {
      const [saved] = [
        {
          templateKey: `k${minutes}`,
          label: "Opener",
          artistType: "band" as const,
          dayIndex: 0,
          setOffsetMs: minutes * MINUTE,
          setDurationMs: 60 * MINUTE,
          soundcheckOffsetMs: -minutes * MINUTE,
          soundcheckDurationMs: 30 * MINUTE,
        },
      ];
      const [back] = positionDraftsToTemplates(positionTemplatesToDrafts([saved!]));
      expect(back?.setOffsetMs).toBe(minutes * MINUTE);
      expect(back?.soundcheckOffsetMs).toBe(-minutes * MINUTE);
    }
  });
});
