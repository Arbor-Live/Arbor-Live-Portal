import { formatUsdOptional } from "@/lib/format";

export const DEFAULT_INVENTORY_CATEGORIES = [
  { value: "sound", label: "Sound" },
  { value: "lighting", label: "Lighting" },
  { value: "staging_rigging", label: "Staging & Rigging" },
  { value: "misc", label: "Misc" },
  { value: "speakers", label: "Speakers" },
  { value: "lighting_fixtures", label: "Lighting Fixtures" },
  { value: "sound_cables_snakes", label: "Sound Cables+Snakes" },
  { value: "microphones_audio_inputs", label: "Microphones/Audio Inputs" },
  { value: "control_surfaces", label: "Control Surfaces" },
  { value: "stands", label: "Stands" },
  { value: "misc_equipment", label: "Misc Equipment" },
  { value: "lighting_cables", label: "Lighting Cables" },
  { value: "network", label: "Network" },
  { value: "power", label: "Power" },
  { value: "monitoring", label: "Monitoring" },
  { value: "hospitality", label: "Hospitality" },
  { value: "organizers", label: "Organizers" },
  { value: "road_case", label: "Road Case" },
  { value: "environmentals", label: "Environmentals" },
  { value: "instruments", label: "Instruments" },
  { value: "dollies", label: "Dollies" },
  { value: "video_photo", label: "Video & Photo" },
  { value: "wireless_dmx", label: "Wireless DMX" },
] as const;

export function toCategoryOptions(
  categories: Array<{ key: string; label: string; active: boolean }> | undefined,
) {
  // While loading, show the built-in list as placeholders. Once the query
  // resolves, only real DB rows — never invent keys that fail on create.
  if (categories === undefined) return DEFAULT_INVENTORY_CATEGORIES;
  return categories
    .filter((category) => category.active)
    .map((category) => ({ value: category.key, label: category.label }));
}

export function formatCurrency(amount?: number) {
  return formatUsdOptional(amount);
}

export function formatCurrencyFromCents(cents?: number) {
  if (cents === undefined || cents === null) return "-";
  return formatCurrency(cents / 100);
}
