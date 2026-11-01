type TickableRow = { itemKey: string; check?: { status: string } };
type TickableHash = {
  totals: { checked: number };
  areas: { checked: number; kits: { rows: TickableRow[] }[]; finalChecks: TickableRow[] }[];
};

/**
 * Apply one tick to the cached hash so it lands on the tap, not the round trip.
 * The server's answer replaces this moments later. A flag stays put: it only
 * comes off through the flag sheet.
 */
export function applyTick<Hash extends TickableHash>(
  live: Hash,
  itemKey: string,
  done: boolean,
  optimisticCheck: NonNullable<TickableRow["check"]>,
): Hash {
  const row = live.areas
    .flatMap((area) => [...area.kits.flatMap((kit) => kit.rows), ...area.finalChecks])
    .find((candidate) => candidate.itemKey === itemKey);
  if (!row || row.check?.status === "flagged" || done === Boolean(row.check)) return live;

  const delta = done ? 1 : -1;
  const editRows = <Row extends TickableRow>(rows: Row[]) =>
    rows.map((candidate) =>
      candidate.itemKey === itemKey ? { ...candidate, check: done ? optimisticCheck : undefined } : candidate,
    );
  return {
    ...live,
    totals: { ...live.totals, checked: live.totals.checked + delta },
    areas: live.areas.map((area) => {
      const inArea = [...area.kits.flatMap((kit) => kit.rows), ...area.finalChecks].some(
        (candidate) => candidate.itemKey === itemKey,
      );
      if (!inArea) return area;
      return {
        ...area,
        checked: area.checked + delta,
        kits: area.kits.map((kit) => ({ ...kit, rows: editRows(kit.rows) })),
        finalChecks: editRows(area.finalChecks),
      };
    }),
  };
}
