import { sortBandsForShow } from "./allocate";
import type { ShowBandInput, ShowFileDocument, ShowFileScene } from "./types";

/** Marsgaritavillefest-shaped showfile.1 index. */
export function buildShowFile(args: {
  eventName: string;
  bands: ShowBandInput[];
  defaultFileName?: string;
}): ShowFileDocument {
  const defaultFile = args.defaultFileName ?? "Default.snap";
  const bands = sortBandsForShow(args.bands);

  const scenes: ShowFileDocument["scenes"] = {
    count: 1 + bands.length,
  };

  const defaultScene: ShowFileScene = {
    name: "Default",
    skip: false,
    link: false,
    type: "SNAP",
    info: "",
    tag: "",
    midi_tx: "",
    file: defaultFile,
  };
  scenes["1"] = defaultScene;

  bands.forEach((band, index) => {
    const scene: ShowFileScene = {
      name: band.bandName,
      skip: false,
      link: false,
      type: "SNAP",
      info: "",
      tag: "",
      midi_tx: "",
      file: `${band.fileStem}.snap`,
    };
    scenes[String(index + 2)] = scene;
  });

  return {
    type: "showfile.1",
    creator_fw: "VERSION_FULL",
    creator_sn: "NO_SERIAL",
    creator_model: "WING-EDIT",
    creator_version: "3.3.2",
    creator_name: "Wing-Edit",
    created: "2000-00-00 00:00:00",
    scenes,
  };
}

/** Filename-safe stem from a band or event name. */
export function fileStem(value: string): string {
  const slug = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return slug || "Band";
}

export function showFileName(eventName: string): string {
  return `${fileStem(eventName)}.show`;
}
