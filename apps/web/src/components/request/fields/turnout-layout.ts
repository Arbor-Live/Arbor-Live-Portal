export const TURNOUT_VIZ_MAX = 2000;
export const DOM_DANCE_MAX = 150;
export const GPU_DANCE_MAX = 500;

const ARC_START = Math.PI * 0.1;
const ARC_END = Math.PI * 0.9;
export const SEMICIRCLE_ORIGIN_Y = 24;

export function getTurnoutEnergy(count: number) {
  if (count < 50) return 1;
  if (count < 100) return 2;
  if (count < 200) return 3;
  return 4;
}

export function rowCapacity(row: number) {
  return 7 + row * 5;
}

export function rowsNeededForCount(count: number) {
  let remaining = count;
  let rows = 0;
  while (remaining > 0) {
    remaining -= rowCapacity(rows);
    rows += 1;
  }
  return rows;
}

export function sceneHeightForCount(count: number, energy: number) {
  const rows = rowsNeededForCount(count);
  return 58 + rows * 15 + energy * 12;
}

/** Fixed slot per index — semicircular crowd facing the stage. */
export function getPersonPosition(index: number, energy: number) {
  let remaining = index;
  let row = 0;

  while (true) {
    const capacity = rowCapacity(row);
    if (remaining < capacity) {
      const t = capacity <= 1 ? 0.5 : remaining / (capacity - 1);
      const angle = ARC_START + t * (ARC_END - ARC_START);
      const radius = 18 + row * 12 + energy * 2.5;

      return {
        x: Math.cos(angle) * radius,
        y: SEMICIRCLE_ORIGIN_Y + Math.sin(angle) * radius * 0.72,
      };
    }
    remaining -= capacity;
    row += 1;
  }
}

