"use client";

import type { PhysicalChangeover } from "@arbor/show-file";

/** Lists yellow “swap on stage” rows between sets. */
export function NightRiderChangeoverList({
  changeovers,
}: {
  changeovers: PhysicalChangeover[];
}) {
  const withSwaps = changeovers.filter((block) => block.lines.length > 0);

  return (
    <section className="space-y-3" data-testid="night-rider-changeovers">
      <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        Changes between artists
      </h3>

      {withSwaps.length === 0 ? (
        <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No physical swaps between sets — mute/unmute only.
        </p>
      ) : (
        <div className="divide-y border">
          {withSwaps.map((block) => (
            <div key={block.title} className="space-y-1.5 px-3 py-2.5">
              <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                {block.title}
              </p>
              <ul className="space-y-1">
                {block.lines.map((line) => (
                  <li
                    key={line}
                    className="border border-status-amber-500/40 bg-status-amber-500/10 px-2 py-1 text-sm text-status-amber-700 dark:text-status-amber-500"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
