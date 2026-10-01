import { formatUsd } from "@/lib/format";
import { QUOTE_SECTION_LABELS, type QuoteLineChange } from "@/lib/quote-diff";

/** Added, removed and repriced lines, grouped by quote section. */
export function QuoteChangeList({ changes }: { changes: QuoteLineChange[] }) {
  if (changes.length === 0) {
    return <p className="text-xs text-muted-foreground">No line amounts changed (pricing, discount or terms did).</p>;
  }
  return (
    <ul className="max-h-56 divide-y overflow-y-auto border" data-testid="quote-change-list">
      {changes.map((change, index) => {
        const line = change.kind === "removed" ? change.before : change.after;
        return (
          <li key={index} className="flex items-baseline gap-2 px-3 py-1.5">
            <span
              className={
                change.kind === "added"
                  ? "w-16 shrink-0 text-xs font-medium text-status-emerald-700"
                  : change.kind === "removed"
                    ? "w-16 shrink-0 text-xs font-medium text-destructive"
                    : "w-16 shrink-0 text-xs font-medium text-status-amber-700"
              }
            >
              {change.kind === "added" ? "Added" : change.kind === "removed" ? "Removed" : "Changed"}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-muted-foreground">{QUOTE_SECTION_LABELS[change.section] ?? change.section} · </span>
              {line.label}
            </span>
            <span className="shrink-0 text-right tabular-nums">
              {change.kind === "changed" ? (
                <>
                  <span className="text-muted-foreground line-through">{formatUsd(change.before.amountUsd)}</span>{" "}
                  {formatUsd(change.after.amountUsd)}
                </>
              ) : change.kind === "removed" ? (
                <span className="text-muted-foreground line-through">{formatUsd(line.amountUsd)}</span>
              ) : (
                formatUsd(line.amountUsd)
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
