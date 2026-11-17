// Verano City's fixed map: the buildings, palms, containers and piers, all placed
// from one seed so the city is the same in every run. Nothing is ever placed on a
// street, on the boulevard band, on the freeway ring, in the sea or in the harbour
// water — those stay open road or open water.
import {
  WORLD, VERTICAL_STREETS, HORIZONTAL_STREETS, STREET_HALF, BOULEVARD, RING,
  HARBOUR, SEA, DISTRICTS, GARAGE,
} from './config.js';

function distanceToBoulevard(x, y) {
  const dx = BOULEVARD.x1 - BOULEVARD.x0;
  const dy = BOULEVARD.y1 - BOULEVARD.y0;
  const lenSq = dx * dx + dy * dy;
  let t = ((x - BOULEVARD.x0) * dx + (y - BOULEVARD.y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = BOULEVARD.x0 + t * dx;
  const py = BOULEVARD.y0 + t * dy;
  return Math.hypot(x - px, y - py);
}

function onGridStreet(x, y) {
  for (const sx of VERTICAL_STREETS) if (Math.abs(x - sx) < STREET_HALF + 14) return true;
  for (const sy of HORIZONTAL_STREETS) if (Math.abs(y - sy) < STREET_HALF + 14) return true;
  return false;
}

function onRing(x, y) {
  const i = RING.inset;
  const inBand = (v, lo, hi) => v > lo - RING.halfWidth && v < lo + RING.halfWidth;
  return (inBand(x, i, 0) && y > i - 40 && y < WORLD.height - i + 40)
    || (inBand(x, WORLD.width - i, 0) && y > i - 40 && y < WORLD.height - i + 40)
    || (inBand(y, i, 0) && x > i - 40 && x < WORLD.width - i + 40)
    || (inBand(y, WORLD.height - i, 0) && x > i - 40 && x < WORLD.width - i + 40);
}

function inWater(x, y) {
  return (x < HARBOUR.width && y < HARBOUR.height)
    || (x > SEA.x && y > SEA.y);
}

function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x && x < d.x + d.width && y >= d.y && y < d.y + d.height) return d;
  }
  return DISTRICTS[4];
}

/** Is this point clear ground for a building (not road, water, boulevard or ring)? */
export function isBuildable(x, y) {
  if (x < RING.inset + 30 || x > WORLD.width - RING.inset - 30) return false;
  if (y < RING.inset + 30 || y > WORLD.height - RING.inset - 30) return false;
  if (onGridStreet(x, y)) return false;
  if (distanceToBoulevard(x, y) < BOULEVARD.halfWidth + 18) return false;
  if (onRing(x, y)) return false;
  if (inWater(x, y)) return false;
  return true;
}

/** Is this point water (blocks cars and walking)? */
export function isWater(x, y) {
  return inWater(x, y);
}

/** Is this point on any road (grid street, boulevard or ring)? */
export function isRoad(x, y) {
  if (onGridStreet(x, y)) return true;
  if (distanceToBoulevard(x, y) < BOULEVARD.halfWidth) return true;
  if (onRing(x, y)) return true;
  return false;
}

export function buildCity(random) {
  const buildings = [];
  const palms = [];
  const containers = [];
  const piers = [];

  // One building per block cell between neighbouring streets, sized to fit the
  // block with a sidewalk margin, never touching a street.
  const xs = [RING.inset, ...VERTICAL_STREETS, WORLD.width - RING.inset];
  const ys = [RING.inset, ...HORIZONTAL_STREETS, WORLD.height - RING.inset];
  for (let bi = 0; bi < xs.length - 1; bi += 1) {
    for (let bj = 0; bj < ys.length - 1; bj += 1) {
      const x0 = xs[bi] + STREET_HALF + 16;
      const y0 = ys[bj] + STREET_HALF + 16;
      const x1 = xs[bi + 1] - STREET_HALF - 16;
      const y1 = ys[bj + 1] - STREET_HALF - 16;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (!isBuildable(cx, cy)) continue;
      // The garage lot replaces the building at the garage corner.
      if (Math.abs(cx - GARAGE.x) < 190 && Math.abs(cy - GARAGE.y) < 170) continue;
      const district = districtAt(cx, cy);
      const tall = district.name === 'Centro' && random.next() < 0.45;
      const w = Math.min(x1 - x0 - 8, random.range(90, 170));
      const h = Math.min(y1 - y0 - 8, random.range(80, tall ? 190 : 140));
      const roof = random.pick(district.roofs);
      const windows = [];
      const cols = Math.max(2, Math.floor(w / 26));
      const rows = Math.max(2, Math.floor(h / 26));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          windows.push({ dx: -w / 2 + 12 + c * ((w - 24) / Math.max(1, cols - 1)), dy: -h / 2 + 12 + r * ((h - 24) / Math.max(1, rows - 1)), lit: random.next() < 0.45 });
        }
      }
      buildings.push({ x: cx - w / 2, y: cy - h / 2, w, h, roof, tall, windows, district: district.name });
    }
  }

  // Palms along the beach and the boulevard.
  for (let i = 0; i < 46; i += 1) {
    const x = random.range(1650, 3100);
    const y = random.range(2080, 2360);
    if (!inWater(x, y) && !onGridStreet(x, y)) palms.push({ x, y, s: random.range(0.8, 1.3) });
  }
  for (let i = 0; i < 26; i += 1) {
    const t = random.next();
    const x = BOULEVARD.x0 + (BOULEVARD.x1 - BOULEVARD.x0) * t + random.range(-58, 58);
    const y = BOULEVARD.y0 + (BOULEVARD.y1 - BOULEVARD.y0) * t + random.range(-58, 58);
    if (distanceToBoulevard(x, y) > BOULEVARD.halfWidth + 4 && !onGridStreet(x, y)) palms.push({ x, y, s: random.range(0.9, 1.2) });
  }

  // Shipping containers stacked in the docks yard.
  const containerColors = ['#b5542e', '#3e6b8a', '#7a8a3e', '#8a5a3e', '#4e7a5a'];
  for (let i = 0; i < 22; i += 1) {
    const x = random.range(90, 560);
    const y = random.range(380, 560);
    containers.push({ x, y, w: 64, h: 26, color: random.pick(containerColors), angle: random.pick([0, 0, Math.PI / 2]) });
  }

  // Piers reaching into the harbour bay from its west edge.
  for (let i = 0; i < 3; i += 1) {
    piers.push({ x: 0, y: 40 + i * 55, w: 150, h: 24 });
  }

  return { buildings, palms, containers, piers };
}
