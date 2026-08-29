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

export function dotRadius(count: number) {
  if (count > 200) return 2;
  if (count > 80) return 3;
  return 5;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function sampleDanceKeyframe(eased: number, sway: number, bounce: number) {
  const segment = eased * 4;
  const i = Math.min(4, Math.floor(segment));
  const f = segment - i;
  const keys = [
    { x: 0, y: 0 },
    { x: sway, y: -bounce },
    { x: -sway * 0.5, y: bounce * 0.2 },
    { x: sway * 0.35, y: -bounce * 0.55 },
    { x: 0, y: 0 },
  ];
  const a = keys[i]!;
  const b = keys[i + 1]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Matches the Web Animations keyframes on PersonDot. */
export function danceOffset(
  index: number,
  count: number,
  energy: number,
  time: number,
  animate: boolean,
  danceMax: number,
) {
  if (!animate || count > danceMax) {
    return { x: 0, y: 0 };
  }

  const bounce = 2 + energy * 0.5;
  const sway = 1 + energy * 0.4;
  const phase = index * 0.31;
  const duration = 0.8 + (index % 4) * 0.1;
  const delay = phase * 0.07;
  const elapsed = time - delay;
  if (elapsed < 0) {
    return { x: 0, y: 0 };
  }

  const normalized = (elapsed % duration) / duration;
  return sampleDanceKeyframe(easeInOut(normalized), sway, bounce);
}

export function personPixelPosition(
  index: number,
  count: number,
  energy: number,
  time: number,
  animate: boolean,
  width: number,
  danceMax: number,
) {
  const base = getPersonPosition(index, energy);
  const dance = danceOffset(index, count, energy, time, animate, danceMax);
  return {
    x: width * 0.5 + base.x + dance.x,
    y: base.y + dance.y,
  };
}

export function dotColor(index: number, energy: number): [number, number, number] {
  const primary: [number, number, number] = [0.12, 0.72, 0.28];
  const primaryDim: [number, number, number] = [0.08, 0.5, 0.2];
  const amber: [number, number, number] = [0.98, 0.65, 0.09];
  const orange: [number, number, number] = [0.98, 0.55, 0.11];

  if (energy >= 4) {
    if (index % 3 === 0) return amber;
    if (index % 3 === 1) return primary;
    return orange;
  }
  if (energy >= 3) {
    return index % 2 === 0 ? primary : primaryDim;
  }
  return primary;
}
