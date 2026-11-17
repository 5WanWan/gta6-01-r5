// The screenshot scenes behind ?shot=chase|delivery|goldhour|foot. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot (drive toward a point ahead, police chase on their own), so
// the frame is what real play looks like and the same seed always gives the same
// frame. The cover is the chase: Gold Hour, three wanted stars, police closing in,
// traffic and pedestrians around, a delivery marker on the HUD.
import { STEP, BOULEVARD, GARAGE } from './config.js';
import { SCREEN_PLAY } from './render.js';

const SAMPLE = STEP;

function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Steer a car toward a point: returns the input direction the world expects. */
function driveToward(world, tx, ty) {
  const p = world.state.player;
  const car = p.car;
  if (!car) return { x: 0, y: 0 };
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  // Obstacle avoidance: if a car or a pedestrian is right ahead, swerve to
  // the clear side instead of ploughing through them.
  let blocked = 0; // +1 means the obstacle is on the right, -1 on the left
  for (const other of world.state.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const across = dx * -fy + dy * fx;
    if (along > 0 && along < 130 && Math.abs(across) < 34) { blocked = across >= 0 ? 1 : -1; break; }
  }
  if (!blocked) {
    for (const ped of world.state.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      const along = dx * fx + dy * fy;
      const across = dx * -fy + dy * fx;
      if (along > 0 && along < 110 && Math.abs(across) < 30) { blocked = across >= 0 ? 1 : -1; break; }
    }
  }
  let aimX = tx;
  let aimY = ty;
  if (blocked !== 0) {
    // Swerve to the clear side: 300 ahead, 140 to the side.
    aimX = car.x + fx * 300 - fy * blocked * 140;
    aimY = car.y + fy * 300 + fx * blocked * 140;
  }
  const wantAngle = Math.atan2(aimY - car.y, aimX - car.x);
  const diff = angleDiff(car.angle, wantAngle);
  const steer = clamp(diff * 2.2, -1, 1);
  // Forward is -y in input space, so throttle is y=-1; steering is x.
  return { x: steer, y: -1 };
}

function simulate(world, seconds, driveFn) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const dir = driveFn ? driveFn(world, i) : { x: 0, y: 0 };
    world.step(SAMPLE, { dir, running: false, actions: {} }, null);
  }
}

/**
 * Clear a corridor of random traffic and pedestrians so a staged scene is
 * exactly the cars the scene places — no random car rear-ending the player,
 * no pedestrian wandering into the frame's path. Police and the player's car
 * are always kept.
 */
function clearCorridor(world, x0, y0, x1, y1, margin) {
  const s = world.state;
  const minX = Math.min(x0, x1) - margin;
  const maxX = Math.max(x0, x1) + margin;
  const minY = Math.min(y0, y1) - margin;
  const maxY = Math.max(y0, y1) + margin;
  const inside = (x, y) => x > minX && x < maxX && y > minY && y < maxY;
  s.cars = s.cars.filter((c) => {
    if (c.role === 'player' || c.role === 'police') return true;
    return !inside(c.x, c.y);
  });
  s.peds = s.peds.filter((p) => !inside(p.x, p.y));
}

/** Place `count` traffic cars on one street, same direction, ahead of the player. */
function placeTrafficAhead(world, street, line, startX, startY, count) {
  const s = world.state;
  const traffic = s.cars.filter((c) => c.role === 'traffic');
  const placed = [];
  for (let i = 0; i < Math.min(count, traffic.length); i += 1) {
    const t = traffic[i];
    t.street = street;
    t.line = line;
    t.dir = 1;
    if (street === 'h') {
      t.x = startX + i * 270;
      t.y = line + (i % 2 === 0 ? 11 : -11);
      t.angle = 0;
    } else {
      t.x = line + (i % 2 === 0 ? 11 : -11);
      t.y = startY + i * 270;
      t.angle = Math.PI / 2;
    }
    t.speed = t.cruise;
    placed.push(t);
  }
  return placed;
}

function chaseScene(world) {
  const s = world.state;
  s.clockMinutes = 17 * 60 + 22; // Gold Hour
  s.cash = 48250;
  s.wanted = 3;
  s.jobIndex = 1;
  s.jobPhase = 'dropoff';
  // Stage the chase on one street, all moving the same way: the player mid-block
  // at speed, police closing from behind, traffic ahead to overtake. The frame
  // is set up deliberately and simulated only briefly, so the composition holds.
  const streetY = 1200;
  world.teleportPlayer(1000, streetY, 0);
  const car = s.player.car;
  car.kind = 'sports';
  car.color = '#c0392b';
  car.speed = 280;
  // Three police behind, staggered across the lanes.
  world.spawnPoliceAt(680, streetY - 22, { x: -130, y: -90 });
  world.spawnPoliceAt(560, streetY + 22, { x: -130, y: 90 });
  world.spawnPoliceAt(420, streetY, { x: -60, y: -160 });
  // Traffic ahead on the same street, same direction, slower — to overtake.
  // Everything else is cleared out of the corridor so nothing random can
  // rear-end the player or wander into the frame.
  clearCorridor(world, 900, streetY - 200, 2100, streetY + 200, 60);
  placeTrafficAhead(world, 'h', streetY, 1450, 0, 3);
  s.radio.push({ text: 'VCPD: suspect is flying down Centro — three stars, all units!', at: s.time });
  s.radio.push({ text: 'Marisol: that guitar is worth $500 base — bring it in HOT.', at: s.time });
  s.radio.push({ text: 'VCPD: unit 7, cut him off at the next intersection.', at: s.time });
  // Drive east for just over a second: the chase is mid-flight, not yet a pile-up.
  simulate(world, 1.2, () => driveToward(world, 2400, streetY));
  return { screen: SCREEN_PLAY };
}

function deliveryScene(world) {
  const s = world.state;
  s.clockMinutes = 17 * 60 + 41; // Gold Hour
  s.cash = 51750;
  s.wanted = 4;
  s.jobIndex = 4;
  s.jobPhase = 'dropoff';
  // Drive the last stretch into the dropoff, then let the delivery land.
  const target = world.jobTarget();
  world.teleportPlayer(target.x - 260, target.y + 40, 0);
  s.player.car.speed = 180;
  world.spawnPoliceAt(target.x - 380, target.y - 200);
  world.spawnPoliceAt(target.x + 300, target.y + 260);
  clearCorridor(world, target.x - 420, target.y - 260, target.x + 200, target.y + 260, 60);
  placeTrafficAhead(world, 'h', target.y, target.x + 420, 0, 2);
  s.radio.push({ text: 'Marisol: the watches are in the car. Gold Hour price, remember.', at: s.time });
  s.radio.push({ text: 'VCPD: four stars — roadblock going up ahead of the suspect.', at: s.time });
  simulate(world, 2.2, () => driveToward(world, target.x, target.y));
  // Let the payout banner sit for a beat.
  simulate(world, 0.8, () => ({ x: 0, y: 0 }));
  return { screen: SCREEN_PLAY };
}

function goldHourScene(world) {
  const s = world.state;
  s.clockMinutes = 17 * 60 + 35; // Gold Hour, sun low over the beach
  s.cash = 31200;
  s.wanted = 1;
  s.jobIndex = 0;
  s.jobPhase = 'pickup';
  // Cruise east along the beach road (horizontal street y=2120) toward the beach.
  world.teleportPlayer(1560, 2120, 0);
  s.player.car.speed = 200;
  world.spawnPoliceAt(1560 - 420, 2120 + 60);
  clearCorridor(world, 1400, 2120 - 200, 2900, 2120 + 200, 60);
  placeTrafficAhead(world, 'h', 2120, 2200, 0, 3);
  s.radio.push({ text: 'VCPD: a red sedan was seen near Solmar Beach. Keep an eye out.', at: s.time });
  s.radio.push({ text: 'Marisol: first job is at the Docks Gate. Easy money.', at: s.time });
  simulate(world, 2.2, () => driveToward(world, 2600, 2120));
  return { screen: SCREEN_PLAY };
}

function footScene(world) {
  const s = world.state;
  s.clockMinutes = 10 * 60 + 15; // bright morning
  s.cash = 8450;
  s.wanted = 0;
  s.jobIndex = 0;
  s.jobPhase = 'pickup';
  s.player.ammo = 24;
  // Step out of the car at the garage forecourt, pistol out, a sports car parked
  // by the kerb with its door open to the street.
  const car = s.player.car;
  car.x = GARAGE.x - 40;
  car.y = GARAGE.y + 130;
  car.angle = -Math.PI / 2;
  car.speed = 0;
  s.player.car = null;
  s.player.onFoot = true;
  s.player.x = GARAGE.x - 40;
  s.player.y = GARAGE.y + 96;
  s.player.angle = -Math.PI / 2;
  const parked = world.state.cars.find((c) => c.role === 'parked' && Math.hypot(c.x - s.player.x, c.y - s.player.y) < 400);
  if (parked) {
    parked.x = GARAGE.x + 30;
    parked.y = GARAGE.y + 150;
    parked.angle = -Math.PI / 2;
    parked.kind = 'sports';
    parked.color = '#2980b9';
  }
  s.radio.push({ text: 'Marisol: on foot at the garage. Steal something fast — heat pays.', at: s.time });
  simulate(world, 2.5, () => ({ x: 0, y: 0 }));
  return { screen: SCREEN_PLAY, prompt: 'Press E to steal the car' };
}

/** Set `world` to the named scene and return the screen to draw over it. */
export function stageShot(name, world) {
  world.reset();
  if (name === 'delivery') return deliveryScene(world);
  if (name === 'goldhour') return goldHourScene(world);
  if (name === 'foot') return footScene(world);
  return chaseScene(world);
}
