"use client";

import type { StageBoxDiagramModel, StageBoxPort } from "@arbor/show-file";
import { regionForPort } from "@arbor/show-file";

const INK = "#0f172a";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";
const HEADER = "#f1f5f9";
const SAME_BG = "#ecfdf5";
const PHYSICAL_BG = "#fffbeb";
const MUTE_BG = "#f8fafc";

const REGION_LABEL: Record<"vox" | "mid" | "drums", string> = {
  vox: "Vox · A.1–4",
  mid: "Mid · A.5–10",
  drums: "Drums · A.11–16",
};

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
      className="overflow-hidden rounded-md border"
      style={{ borderColor: HAIRLINE, background: "#fff" }}
      data-testid="stage-box-patch"
    >
      <div
        className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: HAIRLINE, background: HEADER }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: INK }}>
            {model.title}
          </p>
          <p className="text-xs" style={{ color: MUTED }}>
            {model.subtitle}
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTED }}>
          Plug on SD16 / XR18
        </p>
      </div>

      {colored ? (
        <div
          className="flex flex-wrap gap-3 border-b px-3 py-1.5 text-[10px]"
          style={{ borderColor: HAIRLINE, color: MUTED }}
        >
          <span>
            <span
              className="mr-1 inline-block h-2 w-2 rounded-sm"
              style={{ background: SAME_BG, border: "1px solid #a7f3d0" }}
            />
            Same
          </span>
          <span>
            <span
              className="mr-1 inline-block h-2 w-2 rounded-sm"
              style={{ background: PHYSICAL_BG, border: "1px solid #fde68a" }}
            />
            Swap on stage
          </span>
          <span>
            <span className="mr-1 text-[11px] line-through" style={{ color: "#334155" }}>
              Mute
            </span>
          </span>
        </div>
      ) : null}

      {regions.map((region) => {
        const regionPorts = model.ports.filter((p) => regionForPort(p.port) === region);
        if (regionPorts.length === 0) return null;
        return (
          <div key={region}>
            <div
              className="border-b px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ borderColor: HAIRLINE, background: HEADER, color: MUTED }}
            >
              {REGION_LABEL[region]}
            </div>
            <div
              className="grid grid-cols-2 gap-px sm:grid-cols-4"
              style={{ background: HAIRLINE }}
            >
              {regionPorts.map((port) => (
                <PortCell key={port.port} port={port} colored={colored} />
              ))}
            </div>
          </div>
        );
      })}

      {model.warnings.length > 0 ? (
        <ul
          className="space-y-1 border-t px-3 py-2 text-xs"
          style={{ borderColor: HAIRLINE, color: MUTED }}
        >
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
      ? SAME_BG
      : physical
        ? PHYSICAL_BG
        : muted
          ? MUTE_BG
          : "#fff";

  return (
    <div
      className="flex min-h-[4.5rem] flex-col gap-1 px-2.5 py-2"
      style={{ background: bg }}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className="font-mono text-[11px] font-semibold tabular-nums"
          style={{ color: muted ? "#64748b" : INK }}
        >
          {port.port}
        </span>
        <span className="font-mono text-[10px]" style={{ color: MUTED }}>
          {port.aes50}
        </span>
      </div>

      {physical && port.previousLabel ? (
        <>
          <p className="text-sm font-medium leading-tight" style={{ color: INK }}>
            {port.previousLabel}
            <span style={{ color: MUTED }}> → </span>
            {port.label}
          </p>
          <p className="text-[10px]" style={{ color: MUTED }}>
            {port.templateLabel} · A.{port.port}
          </p>
        </>
      ) : (
        <p
          className="text-sm font-medium leading-tight"
          style={{
            color: muted ? "#334155" : INK,
            textDecoration: muted ? "line-through" : undefined,
            textDecorationColor: muted ? "#0f172a" : undefined,
            textDecorationThickness: muted ? "2px" : undefined,
            opacity: muted ? 0.75 : 1,
          }}
        >
          {port.label}
        </p>
      )}

      {muted ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#334155" }}>
          Mute
        </p>
      ) : null}
      {physical ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#92400e" }}>
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
    <span
      className="rounded px-1 py-0.5 text-[9px] font-medium uppercase"
      style={{ background: HEADER, color: MUTED }}
    >
      {children}
    </span>
  );
}
