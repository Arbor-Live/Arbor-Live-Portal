"use client";

import type { StageBoxDiagramModel, StageBoxPort } from "@arbor/show-file";
import { SNAKE_LABEL } from "@arbor/show-file";
import { cn } from "@/lib/utils";

/**
 * SD16 / XR18 faceplate: only the sockets something plugs into tonight, packed
 * in the allocator's order (families in rider order). When `colored` is set,
 * band diffs use green / mute strikethrough / yellow physical.
 *
 * There are no fixed "vox / mid / drums" bands any more — the old template
 * homes do not hold once the bill drives placement. Each cell prints its socket
 * ("7 (23)" on the daisy-chained second box), so a crew member reads it off the
 * box directly.
 */
export function StageBoxPatchDiagram({
  model,
  colored = false,
}: {
  model: StageBoxDiagramModel;
  colored?: boolean;
}) {
  return (
    <div
      className="overflow-hidden border bg-background"
      data-testid="stage-box-patch"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted px-3 py-2"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">
            {model.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {model.subtitle}
          </p>
        </div>
        <p className="text-3xs uppercase tracking-wide text-muted-foreground">
          Plug on SD16 / XR18
        </p>
      </div>

      {colored ? (
        <div className="flex flex-wrap gap-3 border-b px-3 py-1.5 text-3xs text-muted-foreground">
          <span>
            <span
              className="mr-1 inline-block h-2 w-2 border border-status-emerald-500/40 bg-status-emerald-500/10"
            />
            Same
          </span>
          <span>
            <span
              className="mr-1 inline-block h-2 w-2 border border-status-amber-500/40 bg-status-amber-500/10"
            />
            Swap on stage
          </span>
          <span>
            <span className="mr-1 text-2xs text-muted-foreground line-through">
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
              <div className="border-b bg-background px-3 py-1.5 text-2xs font-semibold text-foreground">
                {SNAKE_LABEL[snake]}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              {boxPorts.map((port) => (
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

      {model.spare.length > 0 ? (
        <p className="border-t px-3 py-2 text-2xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">Leave empty</span>
          {" · "}
          {model.spare.join(" · ")}
        </p>
      ) : null}

      {model.warnings.length > 0 ? (
        <ul className="space-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
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
      ? "bg-status-emerald-500/10"
      : physical
        ? "bg-status-amber-500/10"
        : muted
          ? "bg-muted"
          : "bg-background";

  return (
    <div className={cn("flex min-h-18 flex-col gap-1 px-2.5 py-2", bg)}>
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "font-mono text-2xs font-semibold tabular-nums",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {port.portLabel}
        </span>
        <span className="font-mono text-3xs text-muted-foreground">
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
          <p className="text-3xs text-muted-foreground">
            {port.templateLabel} · {port.aes50}
          </p>
        </>
      ) : (
        <p
          className={cn(
            "text-sm font-medium leading-tight",
            muted ? "text-muted-foreground/75 line-through" : "text-foreground",
          )}
        >
          {port.label}
        </p>
      )}

      {muted ? (
        <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mute
        </p>
      ) : null}
      {physical ? (
        <p className="text-3xs font-semibold uppercase tracking-wide text-status-amber-700 dark:text-status-amber-500">
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
    <span className="rounded-md bg-muted px-1 py-0.5 text-4xs font-medium uppercase text-muted-foreground">
      {children}
    </span>
  );
}
