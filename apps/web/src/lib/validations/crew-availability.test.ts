import { describe, expect, it } from "vitest";
import { postMortemFeedbackSchema } from "./crew-availability";

const answers = { rating: 4, whatWentWell: "Quick load-in.", whatCouldImprove: "More gaff tape." };

function peakTurnoutError(peakTurnout: unknown) {
  const result = postMortemFeedbackSchema.safeParse({ ...answers, peakTurnout });
  return result.success ? null : result.error.issues.map((issue) => issue.message);
}

describe("postMortemFeedbackSchema peakTurnout", () => {
  it("accepts a whole number in range", () => {
    expect(peakTurnoutError(120)).toBeNull();
  });

  it("asks for an estimate when the field is empty", () => {
    expect(peakTurnoutError("")).toEqual(["Please estimate the peak turnout"]);
  });

  it.each([150_000, -5, 12.5])("names the accepted range for %s", (value) => {
    expect(peakTurnoutError(value)).toEqual(["Enter a whole number from 0 to 100,000"]);
  });
});
