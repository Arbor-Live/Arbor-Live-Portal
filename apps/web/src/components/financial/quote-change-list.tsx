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
          // On a phone the amount drops under the label, so a long crew name gets the full width.
          <li
            key={index}
            className="grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-x-2 px-3 py-1.5 sm:grid-cols-[4rem_minmax(0,1fr)_auto]"
          >
            <span
              className={
                change.kind === "added"
                  ? "text-xs font-medium text-status-emerald-700"
                  : change.kind === "removed"
                    ? "text-xs font-medium text-destructive"
                    : "text-xs font-medium text-status-amber-700"
              }
            >
              {change.kind === "added" ? "Added" : change.kind === "removed" ? "Removed" : "Changed"}
            </span>
            {/* Wraps rather than truncates: crew lines carry names, and a touch screen can't hover a title. */}
            <span className="min-w-0 wrap-break-word">
              <span className="text-muted-foreground">{QUOTE_SECTION_LABELS[change.section] ?? change.section} · </span>
              {line.label}
            </span>
            <span className="col-start-2 tabular-nums sm:col-start-auto sm:text-right">
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
