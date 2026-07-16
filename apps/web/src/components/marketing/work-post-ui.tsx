import type { MarketingPostKind } from "@/lib/validations/marketing";
import { marketingPostKindLabels } from "@/lib/validations/marketing";

export function formatWorkPostDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function WorkPostKindBadge({ kind }: { kind: MarketingPostKind }) {
  return (
    <span className="border border-white/35 bg-zinc-950/80 px-2 py-0.5 text-xs font-medium text-zinc-50">
      {marketingPostKindLabels[kind]}
    </span>
  );
}

const gradients = [
  "from-emerald-900/80 via-primary/40 to-zinc-900",
  "from-violet-950/80 via-primary/25 to-zinc-900",
  "from-amber-900/70 via-primary/35 to-zinc-900",
  "from-zinc-900 via-primary/30 to-emerald-950",
];

export function workPostGradient(index: number) {
  return gradients[index % gradients.length];
}
