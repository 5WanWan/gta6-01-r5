// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, paused,
// garage, busted and game over.
//
// ?seed=N fixes the city and the traffic. ?shot=chase|delivery|goldhour|foot
// (with &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP, GARAGE } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM, ACTION_PAUSE, ACTION_INTERACT, ACTION_PUNCH, ACTION_MUTE, createInput,
} from './input.js';
import {
  createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_GARAGE, SCREEN_OVER, SCREEN_BUSTED,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const BUSTED_SECONDS = 2.6;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize()));
  } catch {
    // Storage can be off: the run still plays, it just does not persist.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  renderer.resetCamera(world.state.player.x, world.state.player.y);
  // Diagnostics for the builder's own playtests: the exact staged state.
  window.__shotState = {
    player: {
      x: Math.round(world.state.player.x), y: Math.round(world.state.player.y),
      speed: Math.round(world.state.player.car ? world.state.player.car.speed : 0),
      carHp: world.state.player.car ? Math.round(world.state.player.car.hp) : null,
      health: Math.round(world.state.player.health), wanted: world.state.wanted,
      cash: world.state.cash, jobIndex: world.state.jobIndex, jobPhase: world.state.jobPhase,
    },
    cars: world.state.cars.map((c) => ({
      role: c.role, kind: c.kind, x: Math.round(c.x), y: Math.round(c.y),
      speed: Math.round(c.speed), hp: Math.round(c.hp), dead: c.dead,
    })),
    pedsDown: world.state.peds.filter((p) => p.state === 'down').length,
    pedsTotal: world.state.peds.length,
    radio: world.state.radio.map((r) => r.text),
    banner: world.state.banner,
  };
  let painted = 0;
  function paint() {
    const view = {
      width: window.innerWidth, height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5), dt: STEP,
      best: 0, saveExists: false, mouse: null,
      prompt: scene.prompt || null, garageSelection: 0, muted: false,
    };
    renderer.draw(world, scene.screen, view);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let save = loadSave();
  let garageSelection = 0;
  let bustedTimer = 0;
  let bustedText = '';
  let accumulator = 0;
  let last = performance.now();
  let lastHealth = world.state.player.health;
  let lastCarHp = world.state.player.car ? world.state.player.car.hp : 0;
  let garageBuy = 0;
  let restartKey = false;

  if (save) world.applySave(save);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Digit1') garageBuy = 1;
    else if (event.code === 'Digit2') garageBuy = 2;
    else if (event.code === 'Digit3') garageBuy = 3;
    else if (event.code === 'Digit4') garageBuy = 4;
    else if (event.code === 'KeyR') restartKey = true;
  });

  // The playtest and the finalist review read the live state from here.
  window.__game = {
    world,
    get screen() { return screen; },
    get state() { return world.state; },
  };

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.startMusic();
    screen = SCREEN_PLAY;
    announce('Playing. Six jobs from Marisol Vega. Heat pays.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.bestPayout > best) {
      best = world.state.bestPayout;
      saveBest(best);
    }
    writeSave();
    announce(`Wasted. ${world.state.deliveries} deliveries, $${world.state.earned.toLocaleString('en-US')} earned.`);
  }

  function buyGarage(index) {
    const s = world.state;
    const p = s.player;
    if (!p.car) return;
    if (index === 1) {
      const cost = world.repairCost();
      if (cost <= 0) { audio.denied(); return; }
      if (s.cash < cost) { audio.denied(); return; }
      s.cash -= cost;
      p.car.hp = p.car.maxHp;
      audio.pickup();
    } else if (index === 2) {
      if (s.cash < GARAGE.armorCost) { audio.denied(); return; }
      s.cash -= GARAGE.armorCost;
      s.armor += 50;
      audio.pickup();
    } else if (index === 3) {
      if (s.cash < GARAGE.ammoCost) { audio.denied(); return; }
      s.cash -= GARAGE.ammoCost;
      p.ammo += 24;
      audio.pickup();
    } else if (index === 4) {
      if (s.engineLevel >= 3 || s.cash < 600) { audio.denied(); return; }
      s.cash -= 600;
      s.engineLevel += 1;
      audio.pickup();
    }
    writeSave();
  }

  function handleEvents() {
    for (const event of world.state.events) {
      if (event.type === 'wanted-up') audio.wantedUp();
      else if (event.type === 'delivery') { audio.delivery(); writeSave(); }
      else if (event.type === 'pickup') audio.pickup();
      else if (event.type === 'gunshot') audio.gunshot();
      else if (event.type === 'punch') audio.punch();
      else if (event.type === 'crash') audio.crash(event.strength || 0.5);
      else if (event.type === 'explosion') audio.crash(1);
      else if (event.type === 'busted') {
        bustedText = `The VCPD caught up with you. Fines: $${event.lost.toLocaleString('en-US')}.`;
        bustedTimer = BUSTED_SECONDS;
        screen = SCREEN_BUSTED;
        writeSave();
        announce('Busted. Released at the garage.');
      } else if (event.type === 'wasted') {
        endGame();
      }
    }
  }

  function promptForPlay() {
    const s = world.state;
    const p = s.player;
    if (p.car && world.inGarageZone()) return 'GARAGE — press E: repair, armour, ammo, engine tune';
    if (!p.car) {
      for (const c of s.cars) {
        if (c.dead || c.role === 'police') continue;
        if (Math.hypot(c.x - p.x, c.y - p.y) < 60) return `Press E to steal the ${c.kind}`;
      }
    }
    return null;
  }

  function stepWorld(actions, clicked) {
    const s = world.state;
    const p = s.player;
    // Aim: the mouse position in world coordinates, for the pistol.
    let aimWorld = null;
    if (clicked && p.onFoot) {
      const cam = renderer.camera();
      aimWorld = {
        x: input.mouse.x + cam.x - window.innerWidth / 2,
        y: input.mouse.y + cam.y - window.innerHeight / 2,
      };
    }
    const worldActions = {
      interact: !!(actions & ACTION_INTERACT),
      punch: !!(actions & ACTION_PUNCH),
      shoot: clicked && p.onFoot,
    };
    world.step(STEP, { dir: input.direction(), running: input.isRunning(), actions: worldActions }, aimWorld);
    handleEvents();
    // Damage flash when the player or their car loses health.
    const carHp = p.car ? p.car.hp : 0;
    if (p.health < lastHealth || carHp < lastCarHp) renderer.noteDamage();
    lastHealth = p.health;
    lastCarHp = carHp;
    // Engine and siren follow the driving.
    const inCar = p.car && !p.car.dead;
    const speedRatio = inCar ? Math.abs(p.car.speed) / 430 : 0;
    audio.setEngine(speedRatio, !!inCar);
    audio.setSiren(s.wanted > 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    const clicked = input.takeClick();

    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
    }

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM || clicked) {
        audio.unlock();
        startGame();
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if ((actions & ACTION_INTERACT) && world.state.player.car && world.inGarageZone()) {
        // E at the garage opens the shop instead of exiting the car.
        screen = SCREEN_GARAGE;
        garageSelection = 0;
        announce('Verano Garage. Press 1 to 4 to buy, E to drive out.');
      } else {
        accumulator += dt;
        while (accumulator >= STEP) {
          stepWorld(actions, clicked);
          accumulator -= STEP;
          if (screen !== SCREEN_PLAY) break;
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (restartKey) {
        restartKey = false;
        world.reset();
        screen = SCREEN_PLAY;
        announce('New run. Six jobs from Marisol Vega.');
      }
    } else if (screen === SCREEN_GARAGE) {
      if (garageBuy > 0) {
        garageSelection = garageBuy - 1;
        buyGarage(garageBuy);
        garageBuy = 0;
      } else if (actions & (ACTION_INTERACT | ACTION_PAUSE)) {
        screen = SCREEN_PLAY;
        announce('Back on the road.');
      }
    } else if (screen === SCREEN_BUSTED) {
      bustedTimer -= dt;
      if (bustedTimer <= 0) screen = SCREEN_PLAY;
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        const kept = loadSave();
        world.reset();
        if (kept) world.applySave(kept);
        lastHealth = world.state.player.health;
        lastCarHp = world.state.player.car ? world.state.player.car.hp : 0;
        screen = SCREEN_PLAY;
        announce('Playing. Six jobs from Marisol Vega.');
      }
    }
    restartKey = false;
    garageBuy = 0;

    const view = {
      width: window.innerWidth, height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5), dt,
      best, saveExists: !!save, mouse: input.mouse,
      prompt: screen === SCREEN_PLAY ? promptForPlay() : null,
      garageSelection, muted: audio.isMuted(), bustedText,
    };
    renderer.draw(world, screen, view);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  announce('Verano Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
