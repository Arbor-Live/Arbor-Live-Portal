export type PublicPackageBucket = "lighting" | "sound" | "environmental" | "staging" | "misc";

export const publicBucketLabels: Record<PublicPackageBucket, string> = {
  lighting: "Lighting",
  sound: "Sound",
  environmental: "Environmental",
  staging: "Staging",
  misc: "Misc",
};

export const sectionOrder: PublicPackageBucket[] = [
  "lighting",
  "sound",
  "environmental",
  "staging",
  "misc",
];

type CategoryRow = {
  key: string;
  publicBucket?: PublicPackageBucket | null;
};

export function inferBucketFromCategoryKey(key: string): PublicPackageBucket | undefined {
  const k = key.toLowerCase();
  if (k.includes("light") || k.includes("dmx")) return "lighting";
  if (k.includes("sound") || k.includes("speaker") || k.includes("mic") || k.includes("audio")) {
    return "sound";
  }
  if (k.includes("environment")) return "environmental";
  if (k === "misc" || k.startsWith("misc_") || k.includes("misc")) return "misc";
  if (k.includes("stage") || k.includes("rig") || k.includes("stand") || k.includes("case")) {
    return "staging";
  }
  return undefined;
}

export function bucketForCategoryKey(
  categoryKey: string,
  categories: CategoryRow[] | undefined,
): PublicPackageBucket {
  const category = categories?.find((row) => row.key === categoryKey);
  if (category?.publicBucket) return category.publicBucket;
  return inferBucketFromCategoryKey(categoryKey) ?? "misc";
}

export function formatTypeDisplay(type: {
  manufacturer?: string;
  name: string;
  model: string;
}) {
  const maker = type.manufacturer?.trim();
  const sameNameModel = type.name.trim().toLowerCase() === type.model.trim().toLowerCase();
  const core = sameNameModel ? type.name : `${type.name} / ${type.model}`;
  return maker ? `${maker} ${core}` : core;
}

export function groupRowsBySection<T extends { section: PublicPackageBucket }>(rows: T[]) {
  const grouped = new Map<PublicPackageBucket, T[]>();
  for (const section of sectionOrder) {
    grouped.set(section, []);
  }
  for (const row of rows) {
    grouped.get(row.section)?.push(row);
  }
  return sectionOrder
    .map((section) => ({ section, rows: grouped.get(section) ?? [] }))
    .filter((group) => group.rows.length > 0);
}
