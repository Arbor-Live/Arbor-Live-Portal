/**
 * Edits to a checklist draft, as pure functions on the whole tree: the
 * Checklist tab holds one draft and publishes it whole. Ids stay stable across
 * edits, because live hashes key their ticks on them.
 */

export type ChecklistLine = { id: string; text: string };
export type ChecklistKit = { id: string; name: string; items: ChecklistLine[] };
export type ChecklistPlacement = { kitId: string; extraItems: ChecklistLine[] };
export type ChecklistArea = {
  id: string;
  name: string;
  placements: ChecklistPlacement[];
  finalChecks: ChecklistLine[];
};
export type ChecklistDraft = { kits: ChecklistKit[]; areas: ChecklistArea[] };

export function newChecklistId() {
  return crypto.randomUUID().slice(0, 12);
}

function mapArea(draft: ChecklistDraft, areaId: string, edit: (area: ChecklistArea) => ChecklistArea) {
  return { ...draft, areas: draft.areas.map((area) => (area.id === areaId ? edit(area) : area)) };
}

function mapKit(draft: ChecklistDraft, kitId: string, edit: (kit: ChecklistKit) => ChecklistKit) {
  return { ...draft, kits: draft.kits.map((kit) => (kit.id === kitId ? edit(kit) : kit)) };
}

/** Drop kits no area uses any more: the draft never keeps an orphan to publish. */
function pruneKits(draft: ChecklistDraft): ChecklistDraft {
  const used = new Set(draft.areas.flatMap((area) => area.placements.map((placement) => placement.kitId)));
  return { ...draft, kits: draft.kits.filter((kit) => used.has(kit.id)) };
}

export function areasUsingKit(draft: ChecklistDraft, kitId: string) {
  return draft.areas.filter((area) => area.placements.some((placement) => placement.kitId === kitId));
}

export function addArea(draft: ChecklistDraft, area: { id: string; name: string }): ChecklistDraft {
  return { ...draft, areas: [...draft.areas, { ...area, placements: [], finalChecks: [] }] };
}

export function renameArea(draft: ChecklistDraft, areaId: string, name: string) {
  return mapArea(draft, areaId, (area) => ({ ...area, name }));
}

export function removeArea(draft: ChecklistDraft, areaId: string) {
  return pruneKits({ ...draft, areas: draft.areas.filter((area) => area.id !== areaId) });
}

export function setAreas(draft: ChecklistDraft, areas: ChecklistArea[]): ChecklistDraft {
  return { ...draft, areas };
}

export function setPlacements(draft: ChecklistDraft, areaId: string, placements: ChecklistPlacement[]) {
  return mapArea(draft, areaId, (area) => ({ ...area, placements }));
}

export function setFinalChecks(draft: ChecklistDraft, areaId: string, finalChecks: ChecklistLine[]) {
  return mapArea(draft, areaId, (area) => ({ ...area, finalChecks }));
}

export function addKit(draft: ChecklistDraft, areaId: string, kit: { id: string; name: string }): ChecklistDraft {
  const next = { ...draft, kits: [...draft.kits, { ...kit, items: [] }] };
  return mapArea(next, areaId, (area) => ({
    ...area,
    placements: [...area.placements, { kitId: kit.id, extraItems: [] }],
  }));
}

export function renameKit(draft: ChecklistDraft, kitId: string, name: string) {
  return mapKit(draft, kitId, (kit) => ({ ...kit, name }));
}

export function setKitItems(draft: ChecklistDraft, kitId: string, items: ChecklistLine[]) {
  return mapKit(draft, kitId, (kit) => ({ ...kit, items }));
}

export function setExtraItems(draft: ChecklistDraft, areaId: string, kitId: string, extraItems: ChecklistLine[]) {
  return mapArea(draft, areaId, (area) => ({
    ...area,
    placements: area.placements.map((placement) =>
      placement.kitId === kitId ? { ...placement, extraItems } : placement,
    ),
  }));
}

/** Move one area's placement, with its extras, to another area. */
export function moveKit(draft: ChecklistDraft, kitId: string, fromAreaId: string, toAreaId: string) {
  const placement = draft.areas
    .find((area) => area.id === fromAreaId)
    ?.placements.find((candidate) => candidate.kitId === kitId);
  if (!placement || areasUsingKit(draft, kitId).some((area) => area.id === toAreaId)) return draft;
  const removed = mapArea(draft, fromAreaId, (area) => ({
    ...area,
    placements: area.placements.filter((candidate) => candidate.kitId !== kitId),
  }));
  return mapArea(removed, toAreaId, (area) => ({ ...area, placements: [...area.placements, placement] }));
}

/** A separate copy with fresh ids, right after the original. */
export function duplicateKit(
  draft: ChecklistDraft,
  areaId: string,
  kitId: string,
  makeId: () => string = newChecklistId,
): ChecklistDraft {
  const kit = draft.kits.find((candidate) => candidate.id === kitId);
  if (!kit) return draft;
  const copy = {
    id: makeId(),
    name: `${kit.name} copy`,
    items: kit.items.map((item) => ({ ...item, id: makeId() })),
  };
  return mapArea({ ...draft, kits: [...draft.kits, copy] }, areaId, (area) => {
    const placements = [...area.placements];
    const index = placements.findIndex((placement) => placement.kitId === kitId);
    const extras = placements[index]?.extraItems.map((item) => ({ ...item, id: makeId() })) ?? [];
    placements.splice(index + 1, 0, { kitId: copy.id, extraItems: extras });
    return { ...area, placements };
  });
}

/** The same kit in one more area: its items stay in step, ticks stay separate. */
export function shareKit(draft: ChecklistDraft, kitId: string, toAreaId: string) {
  if (areasUsingKit(draft, kitId).some((area) => area.id === toAreaId)) return draft;
  return mapArea(draft, toAreaId, (area) => ({
    ...area,
    placements: [...area.placements, { kitId, extraItems: [] }],
  }));
}

export function removeKitFromArea(draft: ChecklistDraft, areaId: string, kitId: string) {
  return pruneKits(
    mapArea(draft, areaId, (area) => ({
      ...area,
      placements: area.placements.filter((placement) => placement.kitId !== kitId),
    })),
  );
}

export function removeKitEverywhere(draft: ChecklistDraft, kitId: string) {
  return pruneKits({
    ...draft,
    areas: draft.areas.map((area) => ({
      ...area,
      placements: area.placements.filter((placement) => placement.kitId !== kitId),
    })),
  });
}
