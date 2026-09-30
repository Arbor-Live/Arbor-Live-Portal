import { isSectionBlockType, type ScheduleBlockType } from "./scheduleBlockTypes";

type BlockLike = {
  _id: string;
  blockType: ScheduleBlockType;
  startsAt: number;
  endsAt: number;
};

type ResponseLike = {
  scheduleFingerprint?: string;
  partialWindows?: Array<{ scheduleBlockId?: string }>;
};

/** Crew answer per section; soundchecks and sets are moments inside one. */
export function crewSections<T extends BlockLike>(blocks: T[]) {
  return blocks
    .filter((block) => isSectionBlockType(block.blockType))
    .sort((a, b) => a.startsAt - b.startsAt);
}

/** Stable key for "the sections crew were asked about". */
export function sectionFingerprint(blocks: BlockLike[]) {
  return crewSections(blocks)
    .map((block) => `${block._id}:${block.startsAt}:${block.endsAt}`)
    .sort()
    .join("|");
}

/**
 * True when the sections moved, appeared, or disappeared after the response.
 * Responses saved before fingerprints existed only count as changed when a
 * section they picked is gone.
 */
export function responseScheduleChanged(response: ResponseLike, blocks: BlockLike[]) {
  const sectionIds = new Set(crewSections(blocks).map((block) => block._id));
  const pickedMissing = (response.partialWindows ?? []).some(
    (window) => window.scheduleBlockId !== undefined && !sectionIds.has(window.scheduleBlockId),
  );
  if (pickedMissing) return true;
  if (response.scheduleFingerprint === undefined) return false;
  return response.scheduleFingerprint !== sectionFingerprint(blocks);
}
