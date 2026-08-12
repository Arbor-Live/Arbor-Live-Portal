import {
  captureFor,
  defaultCapture,
  riderSource,
  type RiderInputChannel,
  type RiderSourceReuseClass,
} from "@arbor/rider-document";
import type { SlotFamily } from "./types";

/**
 * Map a rider channel onto a template slot family.
 * Matching is on `sourceKey` (+ reuseClass / stereo), never on free-text `source`.
 */
export function familyForInput(input: RiderInputChannel): SlotFamily {
  const source = input.sourceKey ? riderSource(input.sourceKey) : undefined;
  const capture = source
    ? (captureFor(source, input.inputType) ?? defaultCapture(source))
    : undefined;
  const reuse: RiderSourceReuseClass | undefined = capture?.reuseClass;
  const stereo = Boolean(input.stereo ?? source?.stereo);
  const key = input.sourceKey ?? "";

  if (reuse === "kick" || key === "drum.kick") return "kick";
  if (reuse === "snare" || key.startsWith("drum.snare")) return "snare";
  if (reuse === "tom" || key.startsWith("drum.tom")) return "tom";
  if (reuse === "overhead" || key === "drum.oh") return "oh";
  if (key.startsWith("vox.") || reuse === "vox_wired" || reuse === "vox_wireless") {
    return "vox";
  }
  if (key === "bass" || key.startsWith("bass.")) return "bass";
  if (key === "gtr" || (key.startsWith("gtr.") && !stereo)) return "guitar";
  if (key.startsWith("keys") || (reuse === "di_stereo" && stereo)) return "keys";
  if (stereo && (reuse === "di_stereo" || key.startsWith("keys"))) return "keys";

  // Hat / ride / perc / horns / unmapped / stereo guitar → flex
  return "flex";
}

/**
 * Sort within a band by the rider’s channel order first so Vox 1 stays port 1
 * across bands. sourceKey is a tie-break for identical channel numbers.
 */
export function inputSortKey(input: RiderInputChannel): string {
  const source = input.sourceKey ? riderSource(input.sourceKey) : undefined;
  const capture = source
    ? (captureFor(source, input.inputType) ?? defaultCapture(source))
    : undefined;
  return [
    String(input.channel).padStart(3, "0"),
    input.sourceKey ?? "~unmapped",
    capture?.reuseClass ?? "~",
    input.stereo ? "ST" : "M",
    input.id,
  ].join("|");
}

export function displayLabel(input: RiderInputChannel): string {
  const raw = input.source.trim();
  if (raw) return truncateLabel(raw);
  if (input.sourceKey) {
    const source = riderSource(input.sourceKey);
    if (source) return truncateLabel(source.label);
  }
  return `Ch ${input.channel}`;
}

function truncateLabel(value: string): string {
  // Wing IO names are short; keep something readable on the stage box.
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length <= 12 ? cleaned : `${cleaned.slice(0, 11)}…`;
}
