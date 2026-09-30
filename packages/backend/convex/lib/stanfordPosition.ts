/** Mirrors the crew application `stanfordPosition` field. */
export type StanfordPosition = "undergrad" | "coterm" | "masters" | "phd" | "postdoc" | "other";

export const STANFORD_POSITION_LABELS: Record<StanfordPosition, string> = {
  undergrad: "Undergrad",
  coterm: "Coterm",
  masters: "Master's",
  phd: "PhD",
  postdoc: "Postdoc",
  other: "Other",
};

export function formatStanfordPosition(position: StanfordPosition | undefined | null): string {
  return position ? STANFORD_POSITION_LABELS[position] : "Not provided";
}
