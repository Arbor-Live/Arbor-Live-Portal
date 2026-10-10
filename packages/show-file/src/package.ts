import { zipSync, strToU8 } from "fflate";
import { DEFAULT_PATCH_PLAN, allocateEventPatch, sortBandsForShow } from "./allocate";
import { BOX_CAPACITY, aes50PortFor } from "./slots";
import { buildShowFile, fileStem, showFileName } from "./show";
import { buildBandSnap, buildNightSnap } from "./snap";
import { buildX32Scene, x32Channels } from "./x32";
import { buildXAirScene, xairChannels } from "./xair";
import {
  buildMixingStationScene,
  type MsDesk,
  type MsInputChannel,
} from "./mixing-station";
import { showTargetDesk, x32ColorIndex } from "./palette";
import { buildPatchDiffPlan, buildStageBoxDiagramModel } from "./diagram";
import { loadDefaultTemplate } from "./template";
import type {
  ConsolePreviewRow,
  EventPatchAllocation,
  PatchDiffPlan,
  PatchPlan,
  ShowBandInput,
  ShowDesk,
  ShowTarget,
  SnakeId,
  StageBoxDiagramModel,
  WingSnap,
} from "./types";

export type BuildShowPackageResult = {
  /** ZIP bytes containing the target desk’s show/scene files. */
  zipBytes: Uint8Array;
  fileName: string;
  target: ShowTarget;
  allocation: EventPatchAllocation;
  diagram: StageBoxDiagramModel;
  diffs: PatchDiffPlan;
  sceneNames: string[];
  /** Anything the target desk cannot represent, named for the engineer. */
  warnings: string[];
  /** Channel-by-channel view of how the show lands on the target desk. */
  preview: ConsolePreviewRow[];
};

const ARCHIVE_EXT: Record<ShowTarget, string> = {
  wing: "show",
  x32: "x32",
  "x32-ms": "x32-mixing-station",
  xair: "xr18",
  "xair-ms": "xr18-mixing-station",
};

/**
 * Build a show package for an event, for the desk the crew actually has:
 * a WING show, or X32/M32 and X Air/XR18 scenes — as `.scn` for the desk’s
 * own editor, or as `.msz` for Mixing Station.
 * Skips bands with no inputs. Throws if nothing remains to generate.
 */
export function buildShowPackage(args: {
  eventName: string;
  bands: ShowBandInput[];
  template?: WingSnap;
  /** Snake choices for the night (second stage box). */
  plan?: PatchPlan;
  /** Set false to make every scene a full recall (no snapshot scoping). */
  scope?: boolean;
  /** Which desk to build for. Defaults to the WING. */
  target?: ShowTarget;
  /** Set false to build the report without zipping a download. */
  archive?: boolean;
}): BuildShowPackageResult {
  const target = args.target ?? "wing";
  const desk = showTargetDesk(target);
  const mixingStation = target !== desk;
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
  const scope = args.scope ?? plan.scopeScenes ?? true;

  const files: Record<string, Uint8Array> = {};
  const warnings: string[] = [];

  if (target === "wing") {
    const show = buildShowFile({
      eventName: args.eventName,
      bands: bandsWithInputs,
    });
    files[showFileName(args.eventName)] = strToU8(`${JSON.stringify(show)}\n`);
    // Scene 1 is tonight’s baseline: the full patch, named and muted.
    files["Default.snap"] = strToU8(serializeSnap(buildNightSnap(template, allocation)));
    bandsWithInputs.forEach((band, index) => {
      const snap = buildBandSnap(template, allocation, band, {
        previous: bandsWithInputs[index - 1] ?? null,
        scope,
      });
      files[`${band.fileStem}.snap`] = strToU8(serializeSnap(snap));
    });
  } else if (desk === "x32") {
    const night = buildX32Scene({
      template,
      allocation,
      band: null,
      sceneName: "Default",
    });
    warnings.push(...night.warnings);
    if (!mixingStation) files["Default.scn"] = strToU8(night.text);
    bandsWithInputs.forEach((band, index) => {
      const scene = buildX32Scene({
        template,
        allocation,
        band,
        sceneName: band.bandName,
        previous: bandsWithInputs[index - 1] ?? null,
        scope,
      });
      warnings.push(...scene.warnings);
      if (!mixingStation) files[`${band.fileStem}.scn`] = strToU8(scene.text);
    });
  } else {
    const night = buildXAirScene({
      template,
      allocation,
      band: null,
      sceneName: "Default",
    });
    warnings.push(...night.warnings);
    if (!mixingStation) files["Default.scn"] = strToU8(night.text);
    for (const band of bandsWithInputs) {
      const scene = buildXAirScene({
        template,
        allocation,
        band,
        sceneName: band.bandName,
      });
      warnings.push(...scene.warnings);
      if (!mixingStation) files[`${band.fileStem}.scn`] = strToU8(scene.text);
    }
  }

  // The same night for Mixing Station, which X Air/X32 crews mix from on a
  // phone or tablet: one `.msz` per scene, opened straight into the app. The
  // `.scn` builds above still run, for the warnings they raise.
  if (desk !== "wing" && mixingStation && args.archive !== false) {
    const msDesk: MsDesk = desk === "x32" ? "x32" : "xr18";
    // "Default" is the night baseline; a band that happens to share a stem
    // gets a numbered file rather than replacing it.
    const taken = new Set<string>();
    const entryName = (stem: string) => {
      let name = stem;
      for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} (${n})`;
      taken.add(name.toLowerCase());
      return `${name}.msz`;
    };
    const scenes: Array<{ stem: string; name: string; fileStem: string | null }> = [
      { stem: "Default", name: "Default", fileStem: null },
      ...bandsWithInputs.map((band) => ({
        stem: band.fileStem,
        name: band.bandName,
        fileStem: band.fileStem,
      })),
    ];
    for (const scene of scenes) {
      files[entryName(scene.stem)] = buildMixingStationScene({
        desk: msDesk,
        channels: msChannels(desk, template, allocation, scene.fileStem),
        sceneName: scene.name,
        headamps: scene.fileStem === null,
      });
    }
  }

  const zipBytes =
    args.archive === false ? new Uint8Array(0) : zipSync(files, { level: 6 });
  const diagram = buildStageBoxDiagramModel(allocation, args.eventName);
  const diffs = buildPatchDiffPlan(allocation, args.eventName);

  return {
    zipBytes,
    fileName: `${fileStem(args.eventName)}-${ARCHIVE_EXT[target]}.zip`,
    target,
    allocation,
    diagram,
    diffs,
    sceneNames: ["Default", ...bandsWithInputs.map((b) => b.bandName)],
    // The same loss is named once per band scene; the report wants it once.
    warnings: [...new Set(warnings)],
    preview: previewRows(allocation, bandsWithInputs, desk),
  };
}

/** The `.scn` channel plan for this desk, in Mixing Station’s terms. */
function msChannels(
  desk: "x32" | "xair",
  template: WingSnap,
  allocation: EventPatchAllocation,
  fileStem: string | null,
): Map<number, MsInputChannel> {
  if (desk === "xair") return xairChannels(template, allocation, fileStem);
  const out = new Map<number, MsInputChannel>();
  for (const [n, c] of x32Channels(template, allocation, fileStem)) {
    out.set(n, { ...c, color: x32ColorIndex(c.color) });
  }
  return out;
}

/** How each used channel reads on the target desk, for the report panel. */
function previewRows(
  allocation: EventPatchAllocation,
  bands: ShowBandInput[],
  target: ShowDesk,
): ConsolePreviewRow[] {
  const byKey = new Map(
    allocation.ports.map((port) => [`${port.snake}:${port.port}`, port]),
  );
  const nameByStem = new Map(bands.map((band) => [band.fileStem, band.bandName]));
  // The X Air has no AES50 and no second snake; only Snake A lands on it.
  const snakes: SnakeId[] = target === "xair" ? ["A"] : allocation.snakes;

  const rows: ConsolePreviewRow[] = [];
  for (const snake of snakes) {
    const offset = target === "x32" && snake === "B" ? 16 : 0;
    for (let portNumber = 1; portNumber <= BOX_CAPACITY; portNumber++) {
      const port = byKey.get(`${snake}:${portNumber}`);
      if (!port?.used || port.strip === null) continue;
      const ch = target === "wing" ? port.strip : offset + portNumber;
      const socket = aes50PortFor(snake, portNumber);
      rows.push({
        span: port.stereo ? `${ch}+${ch + 1}` : String(ch),
        name: port.label,
        patch:
          target === "wing"
            ? `A.${socket}`
            : target === "x32"
              ? `A${socket}`
              : `In${String(ch).padStart(2, "0")}`,
        stereo: port.stereo,
        phantom: port.phantom,
        bands: Object.keys(port.bandLabels).map(
          (stem) => nameByStem.get(stem) ?? stem,
        ),
      });
    }
  }
  return rows;
}

/** Wing-Edit snaps use CRLF + 2-space indent. */
export function serializeSnap(snap: WingSnap): string {
  return `${JSON.stringify(snap, null, 2).replace(/\n/g, "\r\n")}\r\n`;
}
