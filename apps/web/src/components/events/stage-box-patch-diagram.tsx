"use client";

import type { SnakeId, StageBoxDiagramModel, StageBoxPort } from "@arbor/show-file";
import { SNAKE_LABEL, aes50PortFor, regionForPort } from "@arbor/show-file";
import { cn } from "@/lib/utils";


const REGION_PORTS: Record<"vox" | "mid" | "drums", [string, number, number]> = {
  vox: ["Vox", 1, 4],
  mid: ["Mid", 5, 10],
  drums: ["Drums", 11, 16],
};

/**
 * Numbers as printed on the stage box, with the desk's sockets alongside when
 * the box sits down the daisy chain: "Vox · 1–4" on the first, "Vox · 1–4
 * (17–20)" on the second.
 */
function regionLabel(region: "vox" | "mid" | "drums", snake: SnakeId): string {
  const [name, first, last] = REGION_PORTS[region];
  const from = aes50PortFor(snake, first);
  const to = aes50PortFor(snake, last);
  const sockets = from === first ? "" : ` (${from}–${to})`;
  return `${name} · ${first}–${last}${sockets}`;
}

/**
 * SD16 / XR18 faceplate in Default.snap order (vox → mid → drums).
 * When `colored` is set, band diffs use green / mute strikethrough / yellow physical.
 */
export function StageBoxPatchDiagram({
  model,
  colored = false,
}: {
  model: StageBoxDiagramModel;
  colored?: boolean;
}) {
  const regions: Array<"vox" | "mid" | "drums"> = ["vox", "mid", "drums"];

  return (
    <div
      className="overflow-hidden rounded-md border border-zinc/20 bg-background"
      data-testid="stage-box-patch"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc/20 bg-muted px-3 py-2"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">
            {model.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {model.subtitle}
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Plug on SD16 / XR18
        </p>
      </div>

      {colored ? (
        <div className="flex flex-wrap gap-3 border-b border-zinc/20 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span>
            <span
              className="mr-1 inline-block h-2 w-2 rounded-sm border border-emerald/30 bg-emerald/10"
            />
            Same
          </span>
          <span>
            <span
              className="mr-1 inline-block h-2 w-2 rounded-sm border border-amber/30 bg-amber/10"
            />
            Swap on stage
          </span>
          <span>
            <span className="mr-1 text-[11px] text-zinc line-through">
              Mute
            </span>
          </span>
        </div>
      ) : null}

      {model.snakes.map((snake) => {
        const boxPorts = model.ports.filter((p) => p.snake === snake);
        if (boxPorts.length === 0) return null;
        return (
          <div key={snake}>
            {model.snakes.length > 1 ? (
              <div className="border-b border-zinc/20 bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground">
                {SNAKE_LABEL[snake]}
              </div>
            ) : null}
            {regions.map((region) => {
              const regionPorts = boxPorts.filter(
                (p) => regionForPort(p.port) === region,
              );
              if (regionPorts.length === 0) return null;
              return (
                <div key={region}>
                  <div className="border-b border-zinc/20 bg-muted px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {regionLabel(region, snake)}
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-zinc/20 sm:grid-cols-4">
                    {regionPorts.map((port) => (
                      <PortCell
                        key={`${port.snake}.${port.port}`}
                        port={port}
                        colored={colored}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {model.spare.length > 0 ? (
        <p className="border-t border-zinc/20 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">Leave empty</span>
          {" · "}
          {model.spare.join(" · ")}
        </p>
      ) : null}

      {model.warnings.length > 0 ? (
        <ul className="space-y-1 border-t border-zinc/20 px-3 py-2 text-xs text-muted-foreground">
          {model.warnings.slice(0, 6).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PortCell({ port, colored }: { port: StageBoxPort; colored: boolean }) {
  const change = colored ? port.change : undefined;
  const muted = change === "mute";
  const physical = change === "physical";
  const bg =
    change === "same"
      ? "bg-emerald/10"
      : physical
        ? "bg-amber/10"
        : muted
          ? "bg-muted"
          : "bg-background";

  return (
    <div className={cn("flex min-h-[4.5rem] flex-col gap-1 px-2.5 py-2", bg)}>
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "font-mono text-[11px] font-semibold tabular-nums",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {port.portLabel}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {port.strip === null ? "—" : `Ch ${port.strip}`}
        </span>
      </div>

      {physical && port.previousLabel ? (
        <>
          <p className="text-sm font-medium leading-tight text-foreground">
            {port.previousLabel}
            <span className="text-muted-foreground"> → </span>
            {port.label}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {port.templateLabel} · {port.aes50}
          </p>
        </>
      ) : (
        <p
          className={cn(
            "text-sm font-medium leading-tight",
            muted ? "text-zinc/75 line-through" : "text-foreground",
          )}
        >
          {port.label}
        </p>
      )}

      {muted ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc">
          Mute
        </p>
      ) : null}
      {physical ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber/90">
          Swap on stage
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-1">
        {port.stereo ? (
          <Tag>ST</Tag>
        ) : null}
        {port.di ? <Tag>DI</Tag> : null}
        {port.phantom ? <Tag>48V</Tag> : null}
      </div>
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
      {children}
    </span>
  );
}
