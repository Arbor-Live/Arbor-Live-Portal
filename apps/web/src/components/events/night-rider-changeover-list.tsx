"use client";

import type { PhysicalChangeover } from "@arbor/show-file";

const INK = "#0f172a";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";
const HEADER = "#f1f5f9";
const PHYSICAL_BG = "#fffbeb";

/** Lists yellow “swap on stage” rows between sets. */
export function NightRiderChangeoverList({
  changeovers,
}: {
  changeovers: PhysicalChangeover[];
}) {
  const withSwaps = changeovers.filter((block) => block.lines.length > 0);

  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ borderColor: HAIRLINE, background: "#fff" }}
      data-testid="night-rider-changeovers"
    >
      <div
        className="border-b px-3 py-2"
        style={{ borderColor: HAIRLINE, background: HEADER }}
      >
        <p className="text-sm font-semibold" style={{ color: INK }}>
          Changes between bands
        </p>
      </div>

      {withSwaps.length === 0 ? (
        <p className="px-3 py-3 text-sm" style={{ color: MUTED }}>
          No physical swaps between sets — mute/unmute only.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: HAIRLINE }}>
          {withSwaps.map((block) => (
            <div key={block.title} className="px-3 py-2.5">
              <p className="text-xs font-semibold" style={{ color: INK }}>
                {block.title}
              </p>
              <ul className="mt-1.5 space-y-1">
                {block.lines.map((line) => (
                  <li
                    key={line}
                    className="rounded px-2 py-1 text-sm"
                    style={{ background: PHYSICAL_BG, color: INK }}
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
