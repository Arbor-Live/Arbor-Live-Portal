import { PORT_BY_NUMBER, TEMPLATE_SLOTS } from "./slots";
import type { EventPatchAllocation, ShowBandInput, WingSnap } from "./types";

/**
 * Clone Default.snap and rewrite AES50 A IO + matching channel strips for one band.
 * Only overheads get 48V. Stereo mode follows the allocation (OH always ST;
 * keys ST unless broken for overflow).
 */
export function buildBandSnap(
  template: WingSnap,
  allocation: EventPatchAllocation,
  band: ShowBandInput,
): WingSnap {
  const snap = structuredClone(template);
  const ioA = snap.ae_data.io.in.A;
  const channels = snap.ae_data.ch;

  for (const slot of TEMPLATE_SLOTS) {
    const assignment = allocation.ports.find((p) => p.port === slot.port);
    const socket = ioA[String(slot.port)];
    if (!socket || !assignment) continue;

    const bandLabel = assignment.bandLabels[band.fileStem];
    const usedByBand = Boolean(bandLabel);
    const stereo = assignment.stereo;
    // Hard rule: phantom only on OH ports.
    const phantom = assignment.family === "oh" && assignment.phantom;

    if (slot.strip === null) {
      const left = allocation.ports.find((p) => p.port === slot.port - 1);
      const leftBand = left?.bandLabels[band.fileStem];
      if (stereo) {
        socket.name = leftBand || left?.label || slot.defaultLabel;
        socket.mode = "ST";
        socket.vph = left?.family === "oh";
      } else {
        // Right half repurposed (e.g. keys broken) — treat as its own mono.
        socket.name = bandLabel || assignment.label || "";
        socket.mode = "M";
        socket.vph = false;
      }
      continue;
    }

    socket.name = bandLabel || assignment.label || slot.defaultLabel;
    socket.mode = stereo ? "ST" : "M";
    socket.vph = phantom;

    const strip = channels[String(slot.strip)];
    if (!strip) continue;

    strip.in = strip.in ?? {};
    strip.in.conn = {
      grp: "A",
      in: slot.port,
      altgrp: "OFF",
      altin: 1,
    };

    if (usedByBand) {
      strip.name = bandLabel;
      strip.mute = false;
    } else {
      strip.name = assignment.label || slot.defaultLabel;
      strip.mute = true;
    }
  }

  // Keep ST right-half in sync when left is stereo
  for (const slot of TEMPLATE_SLOTS) {
    if (slot.strip !== null) continue;
    const leftSlot = PORT_BY_NUMBER.get(slot.port - 1);
    if (!leftSlot) continue;
    const leftAssign = allocation.ports.find((p) => p.port === leftSlot.port);
    if (!leftAssign?.stereo) continue;
    const right = ioA[String(slot.port)];
    const left = ioA[String(leftSlot.port)];
    if (right && left) {
      right.mode = "ST";
      right.name = left.name;
      right.vph = left.vph;
    }
  }

  return snap;
}
