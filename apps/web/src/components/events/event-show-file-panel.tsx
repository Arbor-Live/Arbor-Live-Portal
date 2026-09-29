"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAction } from "convex/react";
import { WarningIcon } from "@phosphor-icons/react";
import {
  SHOW_TARGETS,
  SHOW_TARGET_LABEL,
  type ShowTarget,
} from "@arbor/show-file";
import { api, type Id } from "@/lib/convex-api";
import { downloadBytes } from "@/lib/download-bytes";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PreviewRow = {
  span: string;
  name: string;
  patch: string;
  stereo: boolean;
  phantom: boolean;
  bands: string[];
};

type Report = {
  target: ShowTarget;
  warnings: string[];
  scenes: string[];
  preview: PreviewRow[];
};

/**
 * Pick a desk, read how the night lands on it, then download the show file.
 * The report is the same build the download uses, run without the archive.
 */
export function EventShowFilePanel({ eventId }: { eventId: Id<"events"> }) {
  const preview = useAction(api.eventShowFileDownload.previewByEventId);
  const download = useAction(api.eventShowFileDownload.downloadByEventId);
  const [target, setTarget] = useState<ShowTarget>("wing");
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    preview({ eventId, target })
      .then((result) => {
        if (cancelled) return;
        setReport(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, target, preview]);

  function onTargetChange(value: ShowTarget) {
    setTarget(value);
    setReport(null);
    setStatus("loading");
  }

  async function onDownload() {
    setDownloading(true);
    try {
      const result = await download({ eventId, target });
      downloadBytes(result.bytes, result.fileName, "application/zip");
    } finally {
      setDownloading(false);
    }
  }

  const rows = report?.preview ?? [];
  const summary = report
    ? [
        `${rows.length} channel${rows.length === 1 ? "" : "s"}`,
        `${report.scenes.length} scene${report.scenes.length === 1 ? "" : "s"}`,
        report.warnings.length === 0
          ? "no losses"
          : `${report.warnings.length} to check`,
      ].join(" · ")
    : null;

  return (
    <section className="space-y-3" data-testid="show-file-panel">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          Show file
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={target}
            onValueChange={(value) => onTargetChange(value as ShowTarget)}
          >
            <SelectTrigger className="h-8 w-[170px]" aria-label="Console">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHOW_TARGETS.map((value) => (
                <SelectItem key={value} value={value}>
                  {SHOW_TARGET_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={status !== "ready" || downloading || rows.length === 0}
            onClick={() => void onDownload()}
          >
            {downloading ? "Preparing…" : "Download"}
          </Button>
        </div>
      </div>

      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">Reading the patch…</p>
      ) : status === "error" ? (
        <p className="text-sm text-destructive">
          Couldn’t read the patch for this desk.
        </p>
      ) : (
        <>
          {summary ? (
            <p className="text-sm" data-testid="show-file-summary">
              {summary}
            </p>
          ) : null}

          {report && report.warnings.length > 0 ? (
            <div className="border border-status-amber-500/40 bg-status-amber-500/10 px-3 py-2">
              <ul className="space-y-1 text-sm text-status-amber-700 dark:text-status-amber-500">
                {report.warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-2">
                    <WarningIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <p className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No inputs on this event’s riders yet.
            </p>
          ) : (
            <ul
              className="max-h-80 divide-y overflow-y-auto border"
              data-testid="show-file-preview"
            >
              {rows.map((row) => (
                <li
                  key={`${row.span}-${row.name}`}
                  className="flex items-center gap-3 px-3 py-1.5 text-sm"
                >
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                    {row.span}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {row.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {row.patch}
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {row.stereo ? <Flag>ST</Flag> : null}
                    {row.phantom ? <Flag>48V</Flag> : null}
                  </span>
                  <span
                    className="hidden w-40 shrink-0 truncate text-xs text-muted-foreground md:block"
                    title={row.bands.join(", ")}
                  >
                    {row.bands.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Flag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}
