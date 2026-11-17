// Verano Heat — the simulation: the player on foot or in a car, traffic, pedestrians,
// police, the wanted level, the six story jobs and the HEAT PAYS payout. Everything
// advances in fixed 1/60 s steps. Collision damage is always an event (one hit per
// impact, with a cooldown) or a per-second rate — never a per-frame multiplier —
// and two cars that meet bounce apart instead of averaging their speeds.
import {
  WORLD, VERTICAL_STREETS, HORIZONTAL_STREETS, STREET_HALF, LANE_OFFSET, BOULEVARD,
  RING, GARAGE, PLAYER, CARS, TRAFFIC_COUNT, PED_COUNT, PED_WALK_MIN, PED_WALK_MAX,
  WANTED, HEAT_CAP, GOLD_HOUR_MULT, CLOCK, JOBS, RADIO_LINES, STEP,
} from './config.js';
import { buildCity, isBuildable, isWater, isRoad } from './city.js';
import { createRandom } from './random.js';

const TAU = Math.PI * 2;

function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }

/** Push a circle out of an axis-aligned rectangle; returns the push vector or null. */
function circleRectPush(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  const dSq = dx * dx + dy * dy;
  if (dSq >= r * r) return null;
  if (dSq > 0.0001) {
    const d = Math.sqrt(dSq);
    return { x: (dx / d) * (r - d), y: (dy / d) * (r - d), nx: dx / d, ny: dy / d };
  }
  // Centre inside the rectangle: push out along the smallest penetration.
  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: -(left + r), y: 0, nx: -1, ny: 0 };
  if (min === right) return { x: right + r, y: 0, nx: 1, ny: 0 };
  if (min === top) return { x: 0, y: -(top + r), nx: 0, ny: -1 };
  return { x: 0, y: bottom + r, nx: 0, ny: 1 };
}

const CAR_COLORS = ['#c0392b', '#2980b9', '#f39c12', '#8e44ad', '#16a085', '#d5dbdb', '#e67e22', '#2c3e50', '#c0c0c0'];
const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#ecf0f1', '#fd79a8', '#00cec9'];

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const buildings = city.buildings;

  const state = {
    time: 0,
    clockMinutes: CLOCK.startMinutes,
    goldHour: false,
    wanted: 0,
    lastCrimeAt: -100,
    decayTimer: 0,
    cash: 0,
    jobIndex: 0,
    jobPhase: 'pickup',
    storyComplete: false,
    jobsDone: 0,
    earned: 0,
    bestPayout: 0,
    deliveries: 0,
    armor: 0,
    engineLevel: 0,
    banner: null,
    radio: [],
    radioTimer: 8,
    events: [],
    particles: [],
    skids: [],
    bullets: [],
    cars: [],
    peds: [],
    pickups: [],
    roadblocks: [],
    player: null,
    garageOpen: false,
  };

  function pushRadio(text) {
    state.radio.push({ text, at: state.time });
    if (state.radio.length > 5) state.radio.shift();
  }

  function emit(type, data) {
    state.events.push({ type, ...data });
  }

  function isGoldHour() {
    return state.clockMinutes >= CLOCK.goldStart && state.clockMinutes < CLOCK.goldEnd;
  }

  // ---- placement helpers: everything is placed on a street, never in a block ----
  function nearestStreetPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const sx of VERTICAL_STREETS) {
      for (const sy of HORIZONTAL_STREETS) {
        const d = Math.hypot(x - sx, y - sy);
        if (d < bestD) { bestD = d; best = { x: sx, y: sy }; }
      }
    }
    return best;
  }

  function randomStreetPoint() {
    const sx = random.pick(VERTICAL_STREETS);
    const sy = random.pick(HORIZONTAL_STREETS);
    return { x: sx + random.range(-20, 20), y: sy + random.range(-20, 20) };
  }

  function carCircles(car) {
    const spec = CARS[car.kind];
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const off = spec.length * 0.26;
    const r = spec.width * 0.52;
    return [
      { x: car.x + fx * off, y: car.y + fy * off, r },
      { x: car.x - fx * off, y: car.y - fy * off, r },
    ];
  }

  function makeCar(kind, x, y, angle, role) {
    const spec = CARS[kind];
    return {
      id: Math.floor(random.next() * 1e9),
      kind, role, x, y, angle,
      speed: 0,
      hp: spec.hp,
      maxHp: spec.hp,
      color: kind === 'police' ? '#1c2733' : random.pick(CAR_COLORS),
      cruise: random.range(95, 145),
      street: null, line: 0, dir: 1, lane: 1,
      impactCooldown: 0,
      shootCooldown: random.range(0.5, 1.5),
      stuckTimer: 0,
      pursuitOffset: { x: 0, y: 0 },
      dead: false,
      smokeTimer: 0,
    };
  }

  function makePed(x, y) {
    const vertical = random.next() < 0.5;
    return {
      x, y,
      angle: random.next() * TAU,
      speed: random.range(PED_WALK_MIN, PED_WALK_MAX),
      shirt: random.pick(PED_SHIRTS),
      street: vertical ? 'v' : 'h',
      line: vertical ? random.pick(VERTICAL_STREETS) : random.pick(HORIZONTAL_STREETS),
      dir: random.next() < 0.5 ? 1 : -1,
      side: random.next() < 0.5 ? 1 : -1,
      state: 'walk',
      fleeTimer: 0,
      downTimer: 0,
      bob: random.next() * TAU,
    };
  }

  function spawnTrafficCar() {
    const vertical = random.next() < 0.5;
    const kind = random.pick(['sedan', 'sedan', 'taxi', 'sedan', 'truck', 'sports']);
    const car = makeCar(kind, 0, 0, 0, 'traffic');
    if (vertical) {
      car.street = 'v';
      car.line = random.pick(VERTICAL_STREETS);
      car.dir = random.next() < 0.5 ? 1 : -1;
      car.x = car.line + LANE_OFFSET * car.dir;
      car.y = random.range(200, WORLD.height - 200);
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.street = 'h';
      car.line = random.pick(HORIZONTAL_STREETS);
      car.dir = random.next() < 0.5 ? 1 : -1;
      car.y = car.line + LANE_OFFSET * car.dir;
      car.x = random.range(200, WORLD.width - 200);
      car.angle = car.dir > 0 ? 0 : Math.PI;
    }
    car.speed = car.cruise;
    return car;
  }

  function spawnParkedCar() {
    const vertical = random.next() < 0.5;
    const kind = random.pick(['sedan', 'taxi', 'sports', 'sedan']);
    const car = makeCar(kind, 0, 0, 0, 'parked');
    if (vertical) {
      const line = random.pick(VERTICAL_STREETS);
      car.x = line + (STREET_HALF - 8) * (random.next() < 0.5 ? 1 : -1);
      car.y = random.range(300, WORLD.height - 300);
      car.angle = random.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const line = random.pick(HORIZONTAL_STREETS);
      car.y = line + (STREET_HALF - 8) * (random.next() < 0.5 ? 1 : -1);
      car.x = random.range(300, WORLD.width - 300);
      car.angle = random.next() < 0.5 ? 0 : Math.PI;
    }
    return car;
  }

  function spawnPed() {
    const p = randomStreetPoint();
    const vertical = random.next() < 0.5;
    const ped = makePed(p.x, p.y);
    ped.street = vertical ? 'v' : 'h';
    ped.line = vertical ? p.x : p.y;
    return ped;
  }

  function reset() {
    state.time = 0;
    state.clockMinutes = CLOCK.startMinutes;
    state.goldHour = false;
    state.wanted = 0;
    state.lastCrimeAt = -100;
    state.decayTimer = 0;
    state.cash = 0;
    state.jobIndex = 0;
    state.jobPhase = 'pickup';
    state.storyComplete = false;
    state.jobsDone = 0;
    state.earned = 0;
    state.bestPayout = 0;
    state.deliveries = 0;
    state.armor = 0;
    state.engineLevel = 0;
    state.banner = null;
    state.radio = [];
    state.radioTimer = 8;
    state.events = [];
    state.particles = [];
    state.skids = [];
    state.bullets = [];
    state.roadblocks = [];
    state.policeSpawnCount = 0;
    state.cars = [];
    state.peds = [];
    state.pickups = [];

    // The player's own car waits at the garage forecourt, on the street.
    const starter = makeCar('sedan', GARAGE.x - 40, GARAGE.y + 130, -Math.PI / 2, 'player');
    starter.color = '#e67e22';
    state.cars.push(starter);
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < 10; i += 1) state.cars.push(spawnParkedCar());
    for (let i = 0; i < PED_COUNT; i += 1) state.peds.push(spawnPed());
    state.pickups.push(
      { x: GARAGE.x + 120, y: GARAGE.y + 130, kind: 'ammo', taken: false },
      { x: 880, y: 1200, kind: 'ammo', taken: false },
      { x: 1840, y: 880, kind: 'ammo', taken: false },
    );
    state.player = {
      x: GARAGE.x - 40, y: GARAGE.y + 100, angle: -Math.PI / 2,
      health: PLAYER.maxHealth,
      ammo: PLAYER.pistolAmmoStart,
      onFoot: false,
      car: starter,
      walkSpeed: PLAYER.walkSpeed,
      bustTimer: 0,
    };
    pushRadio('Marisol: welcome to Verano City. Six jobs. Bring heat — it pays.');
    pushRadio('VCPD: evening patrols are out. Drive like somebody is watching.');
  }

  // ---- wanted level ----
  function addWanted(amount, reason) {
    if (amount <= 0) return;
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.lastCrimeAt = state.time;
    state.decayTimer = 0;
    if (state.wanted > before) {
      emit('wanted-up', { level: state.wanted });
      pushRadio(`VCPD: wanted level ${state.wanted} — ${reason}. All units respond.`);
    }
  }

  // ---- damage: one event per impact, with a cooldown; never per frame ----
  function wreckCar(car) {
    if (car.dead) return;
    car.dead = true;
    burst(car.x, car.y, '#ff6b35', 26, 260);
    burst(car.x, car.y, '#555555', 18, 120);
    emit('explosion', { x: car.x, y: car.y });
    if (state.player.car === car) {
      state.player.car = null;
      state.player.onFoot = true;
      state.player.x = car.x + 40;
      state.player.y = car.y;
      pushRadio('VCPD: suspect vehicle is wrecked. Suspect is on foot.');
    }
  }

  function applyCarDamage(car, amount) {
    if (car.dead) return;
    car.hp -= amount;
    if (car.hp <= 0) {
      car.hp = 0;
      wreckCar(car);
    }
  }

  // Crash damage: one hit per impact, gated by a cooldown so a long scrape is
  // one hit, not sixty hits a second.
  function damageCar(car, amount, cause) {
    if (car.dead || car.impactCooldown > 0) return;
    car.impactCooldown = 0.5;
    emit('crash', { x: car.x, y: car.y, strength: Math.min(1, amount / 40) });
    burst(car.x, car.y, '#ffb347', 10, 160);
    applyCarDamage(car, amount);
  }

  function damagePlayer(amount) {
    const p = state.player;
    if (p.health <= 0) return;
    let remaining = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, remaining * 0.6);
      state.armor -= absorbed;
      remaining -= absorbed;
    }
    p.health -= remaining;
    if (p.health <= 0) {
      p.health = 0;
      emit('wasted', {});
    }
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random.next() * TAU;
      const s = random.range(speed * 0.3, speed);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: random.range(0.3, 0.8), maxLife: 0.8, color, size: random.range(2, 5),
      });
    }
  }

  // ---- collisions ----
  function collideCirclesWithBuildings(circles, isCar, car) {
    // Returns the strongest impact speed into a wall this step (0 when just sliding).
    let impact = 0;
    // A car is a rigid body: recompute its circles from its current position
    // before each circle's check, so a push applied to the first circle moves
    // the second one too.
    const circleCount = isCar ? 2 : 1;
    for (let ci = 0; ci < circleCount; ci += 1) {
      const live = isCar ? carCircles(car) : circles;
      const c = live[ci];
      for (const b of buildings) {
        if (c.x < b.x - c.r || c.x > b.x + b.w + c.r || c.y < b.y - c.r || c.y > b.y + b.h + c.r) continue;
        const push = circleRectPush(c.x, c.y, c.r, b);
        if (!push) continue;
        if (isCar && car) {
          // Slide along the wall: remove only the velocity component that points
          // into the building, keep the tangential component. Never scale speed.
          const vx = Math.cos(car.angle) * car.speed;
          const vy = Math.sin(car.angle) * car.speed;
          const intoWall = vx * push.nx + vy * push.ny;
          if (intoWall < 0) {
            impact = Math.max(impact, -intoWall);
            const tx = -push.ny;
            const ty = push.nx;
            const tangent = vx * tx + vy * ty;
            if (Math.abs(tangent) < 1) {
              car.speed = 0;
            } else {
              car.speed = tangent;
              car.angle = Math.atan2(ty * tangent, tx * tangent);
            }
          }
          // Push the whole car out of the wall along the same axis.
          car.x += push.x;
          car.y += push.y;
        } else {
          // On foot: step out of the wall, keep walking along it.
          return push;
        }
      }
    }
    return impact;
  }

  function resolveCarCar(a, b) {
    const circlesA = carCircles(a);
    const circlesB = carCircles(b);
    for (const ca of circlesA) {
      for (const cb of circlesB) {
        const dx = cb.x - ca.x;
        const dy = cb.y - ca.y;
        const d = Math.hypot(dx, dy);
        const minD = ca.r + cb.r;
        if (d >= minD || d < 0.001) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = minD - d;
        // Positional correction: split the overlap evenly, no speed averaging.
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
        // Relative speed along the contact normal decides the hit.
        const avx = Math.cos(a.angle) * a.speed;
        const avy = Math.sin(a.angle) * a.speed;
        const bvx = Math.cos(b.angle) * b.speed;
        const bvy = Math.sin(b.angle) * b.speed;
        const rel = (bvx - avx) * nx + (bvy - avy) * ny;
        if (rel < -30) {
          const hit = -rel;
          // Bounce: each car keeps its tangential speed and loses part of the
          // normal component (restitution 0.35). Speeds are never averaged.
          const aN = avx * nx + avy * ny;
          const bN = bvx * nx + bvy * ny;
          const aT = { x: avx - aN * nx, y: avy - aN * ny };
          const bT = { x: bvx - bN * nx, y: bvy - bN * ny };
          const aN2 = -aN * 0.35 + bN * 0.15;
          const bN2 = -bN * 0.35 + aN * 0.15;
          const avx2 = aT.x + aN2 * nx;
          const avy2 = aT.y + aN2 * ny;
          const bvx2 = bT.x + bN2 * nx;
          const bvy2 = bT.y + bN2 * ny;
          a.speed = Math.hypot(avx2, avy2) * (avx2 * Math.cos(a.angle) + avy2 * Math.sin(a.angle) >= 0 ? 1 : -1);
          b.speed = Math.hypot(bvx2, bvy2) * (bvx2 * Math.cos(b.angle) + bvy2 * Math.sin(b.angle) >= 0 ? 1 : -1);
          a.speed = clamp(a.speed, -120, 460);
          b.speed = clamp(b.speed, -120, 460);
          if (hit > 90) {
            damageCar(a, (hit - 90) * 0.12, 'collision');
            damageCar(b, (hit - 90) * 0.12, 'collision');
          }
        }
      }
    }
  }

  // ---- police ----
  function desiredPolice() {
    return WANTED.policePerLevel[state.wanted];
  }

  // Each police car chases its own point around the player (behind, flanks,
  // ahead) instead of every car aiming at the exact same spot — a formation,
  // not a pile-up.
  const PURSUIT_OFFSETS = [
    { x: -130, y: -90 }, { x: -130, y: 90 }, { x: -60, y: -160 }, { x: -60, y: 160 },
    { x: 140, y: -110 }, { x: 140, y: 110 },
  ];

  function spawnPolice() {
    const p = state.player;
    const angle = random.next() * TAU;
    const dist = random.range(700, 950);
    const x = clamp(p.x + Math.cos(angle) * dist, 160, WORLD.width - 160);
    const y = clamp(p.y + Math.sin(angle) * dist, 160, WORLD.height - 160);
    const point = nearestStreetPoint(x, y);
    const car = makeCar('police', point.x, point.y, Math.atan2(p.y - point.y, p.x - point.x), 'police');
    car.speed = 200;
    car.pursuitOffset = PURSUIT_OFFSETS[state.policeSpawnCount % PURSUIT_OFFSETS.length];
    state.policeSpawnCount += 1;
    state.cars.push(car);
    return car;
  }

  function placeRoadblocks() {
    const p = state.player;
    const heading = p.car ? p.car.angle : p.angle;
    for (const offset of [-1, 1]) {
      const ahead = 420;
      const cx = p.x + Math.cos(heading) * ahead + Math.cos(heading + Math.PI / 2) * offset * 40;
      const cy = p.y + Math.sin(heading) * ahead + Math.sin(heading + Math.PI / 2) * offset * 40;
      const point = nearestStreetPoint(cx, cy);
      const car = makeCar('police', point.x, point.y, heading + Math.PI / 2, 'police');
      car.roadblock = true;
      car.speed = 0;
      state.cars.push(car);
      state.roadblocks.push(car);
    }
    pushRadio('VCPD: roadblock ahead. Suspect is boxed in — move in, units.');
  }

  function clearRoadblocks() {
    for (const car of state.roadblocks) {
      const index = state.cars.indexOf(car);
      if (index >= 0) state.cars.splice(index, 1);
    }
    state.roadblocks = [];
  }

  // ---- missions ----
  function currentJob() { return JOBS[state.jobIndex]; }
  function jobTarget() {
    const job = currentJob();
    return state.jobPhase === 'pickup' ? job.pickup : job.dropoff;
  }

  function completeDelivery() {
    const job = currentJob();
    const heatMult = Math.min(1 + state.wanted, HEAT_CAP);
    const gold = state.goldHour ? GOLD_HOUR_MULT : 1;
    const payout = Math.round(job.base * heatMult * gold);
    state.cash += payout;
    state.earned += payout;
    state.deliveries += 1;
    state.bestPayout = Math.max(state.bestPayout, payout);
    state.jobsDone += 1;
    emit('delivery', { payout, heatMult, gold });
    state.banner = {
      title: `JOB DONE — ${job.title}`,
      sub: `$${job.base} base  ×  HEAT ${heatMult}  ${state.goldHour ? '×  GOLD HOUR 1.5' : ''}  =  $${payout.toLocaleString('en-US')}`,
      until: state.time + 4.5,
    };
    pushRadio(`Marisol: $${payout.toLocaleString('en-US')} is yours. ${state.wanted > 0 ? 'You brought the heat — it paid.' : 'Clean run. Next time, bring some heat.'}`);
    if (state.jobIndex >= JOBS.length - 1) {
      state.storyComplete = true;
      state.jobIndex = Math.floor(random.next() * JOBS.length);
      state.jobPhase = 'pickup';
      pushRadio('Marisol: that was the last of the six. The city is yours now — more work whenever you want it.');
    } else {
      state.jobIndex += 1;
      state.jobPhase = 'pickup';
    }
  }

  // ---- one fixed step ----
  function step(dt, input, aimWorld) {
    state.time += dt;
    state.clockMinutes += dt * CLOCK.minutesPerSecond;
    if (state.clockMinutes >= 1440) state.clockMinutes -= 1440;
    state.goldHour = isGoldHour();
    state.events = [];

    const p = state.player;
    if (state.banner && state.time > state.banner.until) state.banner = null;

    // Radio chatter on a slow timer.
    state.radioTimer -= dt;
    if (state.radioTimer <= 0) {
      state.radioTimer = random.range(14, 24);
      pushRadio(random.pick(RADIO_LINES));
    }

    // Wanted decay: only while no police is near and no recent crime.
    const policeNear = state.cars.some((c) => c.role === 'police' && !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 600);
    if (state.wanted > 0 && !policeNear && state.time - state.lastCrimeAt > 10) {
      state.decayTimer += dt;
      if (state.decayTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.decayTimer = 0;
        pushRadio(`VCPD: suspect lost. Wanted level down to ${state.wanted}.`);
      }
    } else {
      state.decayTimer = 0;
    }

    // ---- player ----
    const car = p.car;
    if (car && !car.dead) {
      const spec = CARS[car.kind];
      const topSpeed = spec.topSpeed * (1 + state.engineLevel * 0.15);
      const dir = input.dir;
      const throttle = dir.y < 0 ? 1 : dir.y > 0 ? -1 : 0;
      if (throttle > 0) {
        // Forward: brake first if still rolling backwards, then accelerate.
        if (car.speed < 0) car.speed = Math.min(0, car.speed + spec.brake * dt);
        else car.speed = Math.min(topSpeed, car.speed + spec.accel * dt);
      } else if (throttle < 0) {
        // Reverse: brake first if still rolling forwards, then back up slowly.
        if (car.speed > 0) car.speed = Math.max(0, car.speed - spec.brake * dt);
        else car.speed = Math.max(-140, car.speed - spec.accel * 0.55 * dt);
      } else {
        // No throttle: rolling friction bleeds speed off, never below zero.
        const drag = 90 * dt;
        car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
      }
      const steer = dir.x;
      if (Math.abs(car.speed) > 12) {
        car.angle += steer * spec.turn * dt * Math.sign(car.speed) * clamp(Math.abs(car.speed) / 120, 0.35, 1);
      }
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 60, WORLD.width - 60);
      car.y = clamp(car.y, 60, WORLD.height - 60);
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      // Skid marks at hard steering.
      if (Math.abs(steer) > 0.6 && Math.abs(car.speed) > 200) {
        state.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 2.2 });
      }
      if (car.hp < car.maxHp * 0.4) {
        car.smokeTimer -= dt;
        if (car.smokeTimer <= 0) {
          car.smokeTimer = 0.12;
          state.particles.push({ x: car.x, y: car.y - 10, vx: random.range(-15, 15), vy: random.range(-40, -15), life: 0.9, maxLife: 0.9, color: '#666666', size: 5 });
        }
      }
    } else if (p.onFoot) {
      const speed = input.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
      let mx = input.dir.x;
      let my = input.dir.y;
      const len = Math.hypot(mx, my);
      if (len > 0) { mx /= len; my /= len; }
      const nx = p.x + mx * speed * dt;
      const ny = p.y + my * speed * dt;
      // On foot, the wall pushes the player out; the player keeps the part of
      // the step that slides along the wall.
      const push = collideCirclesWithBuildings([{ x: nx, y: ny, r: PLAYER.radius }], false, null);
      if (push) {
        p.x = nx + push.x;
        p.y = ny + push.y;
      } else {
        p.x = nx;
        p.y = ny;
      }
      p.x = clamp(p.x, 30, WORLD.width - 30);
      p.y = clamp(p.y, 30, WORLD.height - 30);
      if (len > 0) p.angle = Math.atan2(my, mx);
      if (isWater(p.x, p.y)) {
        // Water is not walkable: step back out of it.
        p.x -= mx * speed * dt;
        p.y -= my * speed * dt;
      }
    }

    // Interact: enter / exit a car.
    if (input.actions && (input.actions.interact)) {
      if (p.car) {
        const old = p.car;
        old.role = 'parked';
        p.car = null;
        p.onFoot = true;
        p.x = old.x + Math.cos(old.angle + Math.PI / 2) * 34;
        p.y = old.y + Math.sin(old.angle + Math.PI / 2) * 34;
        p.angle = old.angle;
      } else {
        let bestCar = null;
        let bestD = 60;
        for (const c of state.cars) {
          if (c.dead || c.role === 'police' || c === p.car) continue;
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d < bestD) { bestD = d; bestCar = c; }
        }
        if (bestCar) {
          if (bestCar.role === 'traffic') {
            // The driver bails out and runs.
            const driver = makePed(bestCar.x + 30, bestCar.y);
            driver.state = 'flee';
            driver.fleeTimer = 3;
            state.peds.push(driver);
          }
          bestCar.role = 'player';
          p.car = bestCar;
          p.onFoot = false;
          addWanted(1, 'grand theft auto');
          emit('steal', { kind: bestCar.kind });
          pushRadio('VCPD: a car was just taken. Units, keep your eyes open.');
        }
      }
    }

    // Punch on foot.
    if (input.actions && input.actions.punch && p.onFoot) {
      emit('punch', { x: p.x, y: p.y });
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.x - p.x, ped.y - p.y);
        const ang = Math.atan2(ped.y - p.y, ped.x - p.x);
        if (d < PLAYER.punchRange && Math.abs(angleDiff(p.angle, ang)) < PLAYER.punchArc) {
          ped.state = 'down';
          ped.downTimer = 6;
          addWanted(1, 'assault');
          burst(ped.x, ped.y, '#ffd166', 6, 120);
          break;
        }
      }
    }

    // Pistol: click aims at the mouse; on foot only.
    if (input.actions && input.actions.shoot && p.onFoot && p.ammo > 0 && aimWorld) {
      p.ammo -= 1;
      const ang = Math.atan2(aimWorld.y - p.y, aimWorld.x - p.x);
      state.bullets.push({
        x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20,
        vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900,
        life: PLAYER.pistolRange / 900, owner: 'player', damage: PLAYER.pistolDamage,
      });
      emit('gunshot', { x: p.x, y: p.y });
      addWanted(1, 'shots fired');
      for (const ped of state.peds) {
        if (Math.hypot(ped.x - p.x, ped.y - p.y) < 160 && ped.state !== 'down') {
          ped.state = 'flee';
          ped.fleeTimer = 2.5;
        }
      }
    }

    // ---- traffic ----
    for (const c of state.cars) {
      if (c.role !== 'traffic' || c.dead) continue;
      // Brake when another car is ahead in the same lane.
      let aheadClear = true;
      const fx = Math.cos(c.angle);
      const fy = Math.sin(c.angle);
      for (const other of state.cars) {
        if (other === c || other.dead) continue;
        const dx = other.x - c.x;
        const dy = other.y - c.y;
        const along = dx * fx + dy * fy;
        const across = Math.abs(dx * -fy + dy * fx);
        if (along > 0 && along < 95 && across < 30) { aheadClear = false; break; }
      }
      const target = aheadClear ? c.cruise : 0;
      if (c.speed < target) c.speed = Math.min(target, c.speed + 200 * dt);
      else if (c.speed > target) c.speed = Math.max(target, c.speed - 380 * dt);
      c.x += fx * c.speed * dt;
      c.y += fy * c.speed * dt;
      // At an intersection, sometimes turn onto the crossing street.
      const crossing = c.street === 'v'
        ? HORIZONTAL_STREETS.find((sy) => Math.abs(c.y - sy) < 6)
        : VERTICAL_STREETS.find((sx) => Math.abs(c.x - sx) < 6);
      if (crossing !== undefined && random.next() < 0.03) {
        if (c.street === 'v') {
          c.street = 'h';
          c.line = crossing;
          c.dir = random.next() < 0.5 ? 1 : -1;
          c.y = crossing + LANE_OFFSET * c.dir;
          c.angle = c.dir > 0 ? 0 : Math.PI;
        } else {
          c.street = 'v';
          c.line = crossing;
          c.dir = random.next() < 0.5 ? 1 : -1;
          c.x = crossing + LANE_OFFSET * c.dir;
          c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }
      // Recycle far-away traffic near the player so the streets stay busy.
      if (Math.hypot(c.x - p.x, c.y - p.y) > 1500) {
        const fresh = spawnTrafficCar();
        Object.assign(c, fresh);
        // Snap the fresh car onto its own street, near the player.
        if (c.street === 'v') {
          c.x = c.line + LANE_OFFSET * c.dir;
          c.y = clamp(p.y + random.range(-700, 700), 200, WORLD.height - 200);
        } else {
          c.y = c.line + LANE_OFFSET * c.dir;
          c.x = clamp(p.x + random.range(-700, 700), 200, WORLD.width - 200);
        }
      }
      if (c.x < 80 || c.x > WORLD.width - 80 || c.y < 80 || c.y > WORLD.height - 80) {
        const fresh = spawnTrafficCar();
        Object.assign(c, fresh);
        if (c.street === 'v') {
          c.x = c.line + LANE_OFFSET * c.dir;
        } else {
          c.y = c.line + LANE_OFFSET * c.dir;
        }
      }
    }

    // ---- police ----
    const police = state.cars.filter((c) => c.role === 'police' && !c.dead && !c.roadblock);
    while (police.length < desiredPolice()) {
      police.push(spawnPolice());
    }
    if (state.wanted >= WANTED.roadblockStars && state.roadblocks.length === 0) placeRoadblocks();
    if (state.wanted < WANTED.roadblockStars && state.roadblocks.length > 0) clearRoadblocks();

    for (const c of police) {
      const spec = CARS.police;
      // Chase this car's own point around the player, in the player's frame,
      // so the pursuit spreads out instead of collapsing onto one spot.
      const off = c.pursuitOffset || { x: 0, y: 0 };
      const tx = p.x + off.x * Math.cos(p.angle) - off.y * Math.sin(p.angle);
      const ty = p.y + off.x * Math.sin(p.angle) + off.y * Math.cos(p.angle);
      const dx = tx - c.x;
      const dy = ty - c.y;
      const dist = Math.hypot(p.x - c.x, p.y - c.y);
      const wantAngle = Math.atan2(dy, dx);
      c.angle = angleLerp(c.angle, wantAngle, Math.min(1, 2.4 * dt));
      const targetSpeed = Math.hypot(dx, dy) > 90 ? spec.topSpeed : spec.topSpeed * 0.55;
      if (c.speed < targetSpeed) c.speed = Math.min(targetSpeed, c.speed + spec.accel * dt);
      else c.speed = Math.max(targetSpeed, c.speed - spec.brake * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      // Stuck against a building: back up briefly, then try again.
      if (Math.abs(c.speed) < 15 && dist > 120) {
        c.stuckTimer += dt;
        if (c.stuckTimer > 1.6) {
          c.x -= Math.cos(c.angle) * 60;
          c.y -= Math.sin(c.angle) * 60;
          c.stuckTimer = 0;
        }
      } else {
        c.stuckTimer = 0;
      }
      // Ram: contact damage is a per-second rate while touching, applied
      // straight to the car's health (no cooldown gate — it IS the rate).
      if (dist < 48 && c.speed > 40) {
        if (p.car && !p.car.dead) {
          applyCarDamage(p.car, WANTED.ramDamagePerSecond * dt);
        } else if (p.onFoot) {
          damagePlayer(WANTED.ramDamagePerSecond * dt);
        }
      }
      // Shoot from wanted 3 up: discrete shots, one at a time.
      if (state.wanted >= WANTED.shootStars && dist < 460 && dist > 60) {
        c.shootCooldown -= dt;
        if (c.shootCooldown <= 0) {
          c.shootCooldown = WANTED.bulletInterval * random.range(0.9, 1.4);
          const spread = random.range(-0.22, 0.22);
          const ang = wantAngle + spread;
          state.bullets.push({
            x: c.x, y: c.y, vx: Math.cos(ang) * 780, vy: Math.sin(ang) * 780,
            life: 0.7, owner: 'police', damage: WANTED.bulletDamage,
          });
          emit('gunshot', { x: c.x, y: c.y });
        }
      }
      // Busted: on foot, a police car sits on the player while wanted.
      if (p.onFoot && state.wanted >= 2 && dist < 52) {
        p.bustTimer += dt;
        if (p.bustTimer > 2.5) {
          p.bustTimer = 0;
          const lost = Math.floor(state.cash * 0.1);
          state.cash -= lost;
          p.health = 50;
          state.wanted = 1;
          p.x = GARAGE.x - 40;
          p.y = GARAGE.y + 100;
          clearRoadblocks();
          emit('busted', { lost });
          pushRadio(`VCPD: suspect in custody. $${lost.toLocaleString('en-US')} in fines. Released at the garage.`);
        }
      } else {
        p.bustTimer = 0;
      }
    }

    // ---- pedestrians ----
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          const index = state.peds.indexOf(ped);
          if (index >= 0) state.peds.splice(index, 1);
        }
        continue;
      }
      let speed = ped.speed;
      if (ped.state === 'flee') {
        speed = ped.speed * 2.2;
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      }
      const along = ped.street === 'v' ? { x: 0, y: ped.dir } : { x: ped.dir, y: 0 };
      const side = ped.street === 'v'
        ? { x: ped.side * (STREET_HALF + 12), y: 0 }
        : { x: 0, y: ped.side * (STREET_HALF + 12) };
      const targetX = ped.street === 'v' ? ped.line + side.x : ped.x + along.x * speed * dt;
      const targetY = ped.street === 'h' ? ped.line + side.y : ped.y + along.y * speed * dt;
      ped.x = ped.street === 'v' ? targetX : clamp(targetX, 60, WORLD.width - 60);
      ped.y = ped.street === 'h' ? targetY : clamp(targetY, 60, WORLD.height - 60);
      ped.angle = Math.atan2(along.y, along.x);
      ped.bob += dt * speed * 0.12;
      // Nobody walks into the water: turn around at the shoreline.
      if (isWater(ped.x, ped.y)) {
        ped.dir *= -1;
        ped.x = clamp(ped.x - along.x * speed * dt * 2, 60, WORLD.width - 60);
        ped.y = clamp(ped.y - along.y * speed * dt * 2, 60, WORLD.height - 60);
      }
      // Turn at an intersection sometimes.
      const crossing = ped.street === 'v'
        ? HORIZONTAL_STREETS.find((sy) => Math.abs(ped.y - sy) < 4)
        : VERTICAL_STREETS.find((sx) => Math.abs(ped.x - sx) < 4);
      if (crossing !== undefined && random.next() < 0.01) {
        if (ped.street === 'v') {
          ped.street = 'h';
          ped.line = crossing;
          ped.dir = random.next() < 0.5 ? 1 : -1;
          ped.side = random.next() < 0.5 ? 1 : -1;
        } else {
          ped.street = 'v';
          ped.line = crossing;
          ped.dir = random.next() < 0.5 ? 1 : -1;
          ped.side = random.next() < 0.5 ? 1 : -1;
        }
      }
      // Run over by the PLAYER's car: one hit, wanted +1, the ped goes down.
      // Other cars never do this to the player: a police car mowing down a
      // pedestrian is the VCPD's problem, not a crime the player committed.
      for (const c of state.cars) {
        if (c.dead || c.role !== 'player') continue;
        if (Math.abs(c.speed) > 60 && Math.hypot(c.x - ped.x, c.y - ped.y) < 30) {
          ped.state = 'down';
          ped.downTimer = 6;
          addWanted(1, 'hit and run');
          burst(ped.x, ped.y, '#ffd166', 8, 140);
          break;
        }
      }
      // A fast car passing close scares pedestrians into fleeing.
      if (ped.state === 'walk') {
        for (const c of state.cars) {
          if (c.dead) continue;
          if (Math.abs(c.speed) > 180 && Math.hypot(c.x - ped.x, c.y - ped.y) < 110) {
            ped.state = 'flee';
            ped.fleeTimer = 2;
            break;
          }
        }
      }
    }
    while (state.peds.length < PED_COUNT) state.peds.push(spawnPed());

    // ---- bullets ----
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (b.owner === 'player') {
        for (const c of state.cars) {
          if (c.dead || c.role === 'player' || c.role === 'parked') continue;
          const hit = carCircles(c).some((cc) => Math.hypot(cc.x - b.x, cc.y - b.y) < cc.r);
          if (hit) {
            b.life = 0;
            applyCarDamage(c, b.damage);
            burst(b.x, b.y, '#ffd166', 6, 140);
            if (c.role === 'police') addWanted(1, 'shooting at police');
            break;
          }
        }
        if (b.life > 0) {
          for (const ped of state.peds) {
            if (ped.state === 'down') continue;
            if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
              b.life = 0;
              ped.state = 'down';
              ped.downTimer = 6;
              addWanted(1, 'shooting');
              break;
            }
          }
        }
      } else if (b.owner === 'police') {
        const target = p.car && !p.car.dead ? p.car : null;
        let hit = false;
        if (target) {
          hit = carCircles(target).some((cc) => Math.hypot(cc.x - b.x, cc.y - b.y) < cc.r);
          if (hit) {
            b.life = 0;
            applyCarDamage(target, b.damage);
          }
        } else if (p.onFoot) {
          if (Math.hypot(p.x - b.x, p.y - b.y) < PLAYER.radius) {
            b.life = 0;
            damagePlayer(b.damage);
          }
        }
        void hit;
      }
      // A bullet that meets a building stops with a spark.
      if (b.life > 0) {
        for (const bd of buildings) {
          if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) {
            b.life = 0;
            burst(b.x, b.y, '#ffe08a', 4, 100);
            break;
          }
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);

    // ---- collisions: cars vs buildings, cars vs cars ----
    for (const c of state.cars) {
      if (c.dead) continue;
      c.impactCooldown = Math.max(0, c.impactCooldown - dt);
      const circles = carCircles(c);
      const impact = collideCirclesWithBuildings(circles, true, c);
      if (impact > 120 && c.role !== 'parked') {
        damageCar(c, (impact - 120) * 0.15, 'crash');
      }
      if (c.role !== 'parked') {
        c.x = clamp(c.x, 60, WORLD.width - 60);
        c.y = clamp(c.y, 60, WORLD.height - 60);
      }
    }
    const liveCars = state.cars.filter((c) => !c.dead);
    for (let i = 0; i < liveCars.length; i += 1) {
      for (let j = i + 1; j < liveCars.length; j += 1) {
        const a = liveCars[i];
        const b = liveCars[j];
        if (a.role === 'parked' && b.role === 'parked') continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > 90) continue;
        resolveCarCar(a, b);
      }
    }

    // ---- pickups ----
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      const d = Math.hypot(p.x - pk.x, p.y - pk.y);
      if (d < 46) {
        pk.taken = true;
        if (pk.kind === 'ammo') {
          p.ammo += 12;
          pushRadio('Ammo crate picked up: +12 rounds.');
          emit('pickup', { kind: 'ammo' });
        }
      }
    }

    // ---- missions ----
    const target = jobTarget();
    const targetD = Math.hypot(p.x - target.x, p.y - target.y);
    if (targetD < 75) {
      if (state.jobPhase === 'pickup') {
        state.jobPhase = 'dropoff';
        emit('pickup', { kind: 'package' });
        pushRadio(`Marisol: package is in the car. Deliver it to ${currentJob().dropoff.label} — and remember, heat pays.`);
      } else {
        completeDelivery();
      }
    }

    // ---- particles and skids fade ----
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);

    // Remove wrecks after a while so the streets clear.
    state.cars = state.cars.filter((c) => !c.dead || c.role === 'player' || c.role === 'parked');
    // Keep parked cars around; traffic and police respawn through their own logic.
  }

  // ---- garage ----
  function inGarageZone() {
    const p = state.player;
    return p.car && !p.car.dead
      && p.x > GARAGE.x - GARAGE.width / 2 - 40 && p.x < GARAGE.x + GARAGE.width / 2 + 40
      && p.y > GARAGE.y - GARAGE.height / 2 - 40 && p.y < GARAGE.y + GARAGE.height / 2 + 40;
  }

  function repairCost() {
    const car = state.player.car;
    if (!car) return 0;
    return Math.round((1 - car.hp / car.maxHp) * GARAGE.repairCost);
  }

  // ---- save / load ----
  function serialize() {
    return {
      cash: state.cash, jobIndex: state.jobIndex, jobsDone: state.jobsDone,
      earned: state.earned, bestPayout: state.bestPayout, deliveries: state.deliveries,
      armor: state.armor, engineLevel: state.engineLevel, storyComplete: state.storyComplete,
    };
  }

  function applySave(save) {
    if (!save) return;
    state.cash = save.cash || 0;
    state.jobIndex = save.jobIndex || 0;
    state.jobsDone = save.jobsDone || 0;
    state.earned = save.earned || 0;
    state.bestPayout = save.bestPayout || 0;
    state.deliveries = save.deliveries || 0;
    state.armor = save.armor || 0;
    state.engineLevel = save.engineLevel || 0;
    state.storyComplete = !!save.storyComplete;
    state.jobPhase = 'pickup';
  }

  // ---- staging helpers (used by the ?shot= screenshot scenes) ----
  function spawnPoliceAt(x, y, offset) {
    const car = makeCar('police', x, y, Math.atan2(state.player.y - y, state.player.x - x), 'police');
    car.speed = 220;
    car.pursuitOffset = offset || { x: -130, y: 0 };
    state.cars.push(car);
    return car;
  }

  function teleportPlayer(x, y, angle) {
    const p = state.player;
    if (p.car && !p.car.dead) {
      p.car.x = x;
      p.car.y = y;
      p.car.angle = angle;
      p.car.speed = 0;
    }
    p.x = x;
    p.y = y;
    p.angle = angle;
  }

  reset();

  return {
    state,
    city,
    reset,
    step,
    jobTarget,
    currentJob,
    inGarageZone,
    repairCost,
    serialize,
    applySave,
    spawnPoliceAt,
    teleportPlayer,
    isBuildable,
    isWater,
    isRoad,
  };
}
