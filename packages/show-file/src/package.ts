import { zipSync, strToU8 } from "fflate";
import { DEFAULT_PATCH_PLAN, allocateEventPatch, sortBandsForShow } from "./allocate";
import { buildShowFile, fileStem, showFileName } from "./show";
import { buildBandSnap, buildNightSnap } from "./snap";
import { buildPatchDiffPlan, buildStageBoxDiagramModel } from "./diagram";
import { loadDefaultTemplate } from "./template";
import type {
  EventPatchAllocation,
  PatchDiffPlan,
  PatchPlan,
  ShowBandInput,
  StageBoxDiagramModel,
  WingSnap,
} from "./types";

export type BuildShowPackageResult = {
  /** ZIP bytes containing .show + Default.snap + per-band .snap files. */
  zipBytes: Uint8Array;
  fileName: string;
  allocation: EventPatchAllocation;
  diagram: StageBoxDiagramModel;
  diffs: PatchDiffPlan;
  sceneNames: string[];
};

/**
 * Build a Wing-Edit show package for an event.
 * Skips bands with no inputs. Throws if nothing remains to generate.
 */
export function buildShowPackage(args: {
  eventName: string;
  bands: ShowBandInput[];
  template?: WingSnap;
  /** Snake choices for the night (second stage box, per-group sides). */
  plan?: PatchPlan;
  /** Set false to make every scene a full recall (no snapshot scoping). */
  scope?: boolean;
}): BuildShowPackageResult {
  const bandsWithInputs = sortBandsForShow(
    args.bands.filter((band) => band.inputs.length > 0),
  ).map((band) => ({
    ...band,
    fileStem: band.fileStem || fileStem(band.bandName),
  }));

  if (bandsWithInputs.length === 0) {
    throw new Error(
      "No band riders with inputs on this event. Add performers and publish or set a default rider first.",
    );
  }

  const template = args.template ?? loadDefaultTemplate();
  const plan = args.plan ?? DEFAULT_PATCH_PLAN;
  const allocation = allocateEventPatch(bandsWithInputs, plan);
  const show = buildShowFile({
    eventName: args.eventName,
    bands: bandsWithInputs,
  });

  const files: Record<string, Uint8Array> = {
    [showFileName(args.eventName)]: strToU8(`${JSON.stringify(show)}\n`),
    // Scene 1 is tonight's baseline: the full patch, named and muted.
    "Default.snap": strToU8(serializeSnap(buildNightSnap(template, allocation))),
  };

  const scope = args.scope ?? plan.scopeScenes ?? true;
  bandsWithInputs.forEach((band, index) => {
    const snap = buildBandSnap(template, allocation, band, {
      previous: bandsWithInputs[index - 1] ?? null,
      scope,
    });
    files[`${band.fileStem}.snap`] = strToU8(serializeSnap(snap));
  });

  const zipBytes = zipSync(files, { level: 6 });
  const diagram = buildStageBoxDiagramModel(allocation, args.eventName);
  const diffs = buildPatchDiffPlan(allocation, args.eventName);

  return {
    zipBytes,
    fileName: `${fileStem(args.eventName)}-show.zip`,
    allocation,
    diagram,
    diffs,
    sceneNames: ["Default", ...bandsWithInputs.map((b) => b.bandName)],
  };
}

/** Wing-Edit snaps use CRLF + 2-space indent. */
export function serializeSnap(snap: WingSnap): string {
  return `${JSON.stringify(snap, null, 2).replace(/\n/g, "\r\n")}\r\n`;
}
