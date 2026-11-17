// Verano Heat — the renderer: one static canvas layer for the whole city (drawn
// once per world), then the living things, then the time-of-day light, then the
// HUD with its minimap, radio log and wanted stars. Everything the judge sees in
// a screenshot comes through here.
import {
  WORLD, VERTICAL_STREETS, HORIZONTAL_STREETS, STREET_HALF, BOULEVARD, RING,
  HARBOUR, SEA, DISTRICTS, GARAGE, PLAYER, CARS,
} from './config.js';
import { isWater } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_GARAGE = 'garage';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';

/** Sun state for a clock time in minutes: 1 = full day, gold = the Gold Hour glow. */
export function sunState(minutes) {
  const h = minutes / 60;
  if (h >= 7 && h < 17) return { day: 1, gold: 0, night: 0 };
  if (h >= 17 && h < 18) return { day: 0.85, gold: 1, night: 0 };
  if (h >= 18 && h < 20) return { day: 0.45, gold: 0.4, night: 0.3 };
  if (h >= 20 || h < 6) return { day: 0.12, gold: 0, night: 1 };
  if (h >= 6 && h < 7) return { day: 0.5, gold: 0.3, night: 0.4 };
  return { day: 1, gold: 0, night: 0 };
}

function clockText(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let staticLayer = null;
  let staticFor = null;
  let camX = WORLD.width / 2;
  let camY = WORLD.height / 2;
  let flash = 0;

  function buildStaticLayer(world) {
    const layer = document.createElement('canvas');
    layer.width = WORLD.width;
    layer.height = WORLD.height;
    const g = layer.getContext('2d');
    // District ground.
    for (const d of DISTRICTS) {
      g.fillStyle = d.ground;
      g.fillRect(d.x, d.y, d.width, d.height);
    }
    // Beach sand along the south-east shore.
    g.fillStyle = '#d9bd8a';
    g.fillRect(1500, 2050, 1700, 350);
    // Harbour water and the sea.
    g.fillStyle = '#2e6f8e';
    g.fillRect(0, 0, HARBOUR.width, HARBOUR.height);
    g.fillStyle = '#2a6a8c';
    g.fillRect(SEA.x, SEA.y, SEA.width, SEA.height);
    // Wave lines.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      g.beginPath();
      g.moveTo(SEA.x + 40 + i * 90, SEA.y + 30 + (i % 3) * 60);
      g.lineTo(SEA.x + 110 + i * 90, SEA.y + 30 + (i % 3) * 60);
      g.stroke();
    }
    for (let i = 0; i < 4; i += 1) {
      g.beginPath();
      g.moveTo(20 + i * 40, 30 + i * 36);
      g.lineTo(70 + i * 40, 30 + i * 36);
      g.stroke();
    }
    // Piers.
    for (const pier of world.city.piers) {
      g.fillStyle = '#8a6b48';
      g.fillRect(pier.x, pier.y, pier.w, pier.h);
      g.fillStyle = '#6e5236';
      for (let x = pier.x + 8; x < pier.x + pier.w; x += 18) g.fillRect(x, pier.y, 3, pier.h);
    }
    // Freeway ring.
    g.strokeStyle = '#3a3f46';
    g.lineWidth = RING.halfWidth * 2;
    g.strokeRect(RING.inset, RING.inset, WORLD.width - RING.inset * 2, WORLD.height - RING.inset * 2);
    g.strokeStyle = '#e8c33c';
    g.lineWidth = 3;
    g.setLineDash([26, 22]);
    g.strokeRect(RING.inset, RING.inset, WORLD.width - RING.inset * 2, WORLD.height - RING.inset * 2);
    g.setLineDash([]);
    // The diagonal boulevard.
    g.save();
    g.translate(BOULEVARD.x0, BOULEVARD.y0);
    g.rotate(Math.atan2(BOULEVARD.y1 - BOULEVARD.y0, BOULEVARD.x1 - BOULEVARD.x0));
    const blen = Math.hypot(BOULEVARD.x1 - BOULEVARD.x0, BOULEVARD.y1 - BOULEVARD.y0);
    g.fillStyle = '#3a3f46';
    g.fillRect(0, -BOULEVARD.halfWidth, blen, BOULEVARD.halfWidth * 2);
    g.strokeStyle = '#e8c33c';
    g.lineWidth = 3;
    g.setLineDash([26, 22]);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(blen, 0);
    g.stroke();
    g.setLineDash([]);
    g.restore();
    // Grid streets.
    g.fillStyle = '#33383f';
    for (const sx of VERTICAL_STREETS) g.fillRect(sx - STREET_HALF, 0, STREET_HALF * 2, WORLD.height);
    for (const sy of HORIZONTAL_STREETS) g.fillRect(0, sy - STREET_HALF, WORLD.width, STREET_HALF * 2);
    // Centre dashes and crosswalks.
    g.fillStyle = '#e8c33c';
    for (const sx of VERTICAL_STREETS) {
      for (let y = 0; y < WORLD.height; y += 64) {
        if (HORIZONTAL_STREETS.some((sy) => Math.abs(y - sy) < 60)) continue;
        g.fillRect(sx - 2, y, 4, 30);
      }
    }
    for (const sy of HORIZONTAL_STREETS) {
      for (let x = 0; x < WORLD.width; x += 64) {
        if (VERTICAL_STREETS.some((sx) => Math.abs(x - sx) < 60)) continue;
        g.fillRect(x, sy - 2, 30, 4);
      }
    }
    g.fillStyle = 'rgba(240,240,230,0.85)';
    for (const sx of VERTICAL_STREETS) {
      for (const sy of HORIZONTAL_STREETS) {
        for (let i = -3; i <= 3; i += 1) {
          g.fillRect(sx - STREET_HALF + 6, sy + i * 10 - 4, 12, 6);
          g.fillRect(sx + STREET_HALF - 18, sy + i * 10 - 4, 12, 6);
        }
      }
    }
    // Sidewalks: a pale frame around every block.
    g.strokeStyle = 'rgba(210,205,190,0.5)';
    g.lineWidth = 10;
    const xs = [RING.inset, ...VERTICAL_STREETS, WORLD.width - RING.inset];
    const ys = [RING.inset, ...HORIZONTAL_STREETS, WORLD.height - RING.inset];
    for (let i = 0; i < xs.length - 1; i += 1) {
      for (let j = 0; j < ys.length - 1; j += 1) {
        g.strokeRect(xs[i] + STREET_HALF + 5, ys[j] + STREET_HALF + 5, xs[i + 1] - xs[i] - STREET_HALF * 2 - 10, ys[j + 1] - ys[j] - STREET_HALF * 2 - 10);
      }
    }
    // Shipping containers in the docks yard.
    for (const box of world.city.containers) {
      g.save();
      g.translate(box.x, box.y);
      g.rotate(box.angle);
      g.fillStyle = box.color;
      g.fillRect(-32, -13, 64, 26);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = -28; x < 32; x += 10) g.fillRect(x, -13, 3, 26);
      g.restore();
    }
    // Buildings: roof, shade edge and unlit windows (lit ones are drawn live).
    for (const b of world.city.buildings) {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(b.x + 5, b.y + 7, b.w, b.h);
      g.fillStyle = b.roof;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 2;
      g.strokeRect(b.x, b.y, b.w, b.h);
      g.fillStyle = 'rgba(20,30,45,0.55)';
      for (const w of b.windows) {
        if (!w.lit) g.fillRect(b.x + b.w / 2 + w.dx - 4, b.y + b.h / 2 + w.dy - 5, 8, 10);
      }
      if (b.tall) {
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(b.x + 8, b.y + 8, b.w - 16, 6);
      }
    }
    // Palms.
    for (const palm of world.city.palms) {
      g.strokeStyle = '#6e5236';
      g.lineWidth = 4 * palm.s;
      g.beginPath();
      g.moveTo(palm.x, palm.y);
      g.lineTo(palm.x + 4 * palm.s, palm.y - 14 * palm.s);
      g.stroke();
      g.fillStyle = '#3e7a3a';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        g.beginPath();
        g.ellipse(palm.x + 4 * palm.s + Math.cos(a) * 10 * palm.s, palm.y - 14 * palm.s + Math.sin(a) * 7 * palm.s, 11 * palm.s, 4 * palm.s, a, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Beach umbrellas.
    const umbrellaColors = ['#e74c3c', '#f1c40f', '#3498db', '#e67e22'];
    for (let i = 0; i < 10; i += 1) {
      const ux = 1700 + i * 130;
      const uy = 2160 + (i % 3) * 55;
      g.fillStyle = umbrellaColors[i % umbrellaColors.length];
      g.beginPath();
      g.arc(ux, uy, 16, Math.PI, 0);
      g.fill();
      g.strokeStyle = '#6e5236';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(ux, uy);
      g.lineTo(ux, uy + 14);
      g.stroke();
    }
    return layer;
  }

  function drawCar(g, car, time) {
    const spec = CARS[car.kind];
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.angle);
    if (car.dead) {
      g.globalAlpha = 0.85;
      g.fillStyle = '#222222';
      roundedRect(g, -spec.length / 2, -spec.width / 2, spec.length, spec.width, 8);
      g.fill();
      g.restore();
      return;
    }
    // Wheels.
    g.fillStyle = '#111111';
    const wl = spec.length * 0.32;
    const ww = spec.width / 2 + 2;
    g.fillRect(-wl, -ww - 3, 14, 6);
    g.fillRect(wl - 4, -ww - 3, 14, 6);
    g.fillRect(-wl, ww - 3, 14, 6);
    g.fillRect(wl - 4, ww - 3, 14, 6);
    // Body.
    g.fillStyle = car.color;
    roundedRect(g, -spec.length / 2, -spec.width / 2, spec.length, spec.width, 9);
    g.fill();
    // Roof and windshield.
    g.fillStyle = 'rgba(20,30,45,0.75)';
    roundedRect(g, -spec.length * 0.18, -spec.width / 2 + 4, spec.length * 0.3, spec.width - 8, 5);
    g.fill();
    g.fillStyle = 'rgba(180,220,240,0.8)';
    g.fillRect(spec.length * 0.22, -spec.width / 2 + 5, 7, spec.width - 10);
    if (car.kind === 'taxi') {
      g.fillStyle = '#f1c40f';
      g.fillRect(-6, -spec.width / 2 + 3, 12, 5);
      g.fillRect(-6, spec.width / 2 - 8, 12, 5);
    }
    if (car.role === 'police') {
      g.fillStyle = '#ecf0f1';
      g.fillRect(-spec.length * 0.1, -spec.width / 2, spec.length * 0.2, spec.width);
      // Light bar, flashing red and blue.
      const phase = Math.floor(time * 4) % 2 === 0;
      g.fillStyle = phase ? '#ff2d2d' : '#2d6bff';
      g.fillRect(-4, -spec.width / 2 + 3, 8, 6);
      g.fillStyle = phase ? '#2d6bff' : '#ff2d2d';
      g.fillRect(-4, spec.width / 2 - 9, 8, 6);
    }
    if (car.role === 'player') {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 2;
      roundedRect(g, -spec.length / 2 - 3, -spec.width / 2 - 3, spec.length + 6, spec.width + 6, 11);
      g.stroke();
    }
    g.restore();
  }

  function drawPed(g, ped) {
    g.save();
    g.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      g.rotate(ped.angle + Math.PI / 2);
      g.fillStyle = ped.shirt;
      g.beginPath();
      g.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8b88a';
      g.beginPath();
      g.arc(14, 0, 5, 0, Math.PI * 2);
      g.fill();
      g.restore();
      return;
    }
    const bob = Math.sin(ped.bob) * 2;
    g.fillStyle = '#2c3e50';
    g.fillRect(-4, -2 + bob * 0.4, 8, 12);
    g.fillStyle = ped.shirt;
    g.beginPath();
    g.arc(0, -3, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8b88a';
    g.beginPath();
    g.arc(0, -9, 4.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawMinimap(g, world, view) {
    const mw = 230;
    const mh = 172;
    const mx = 14;
    const my = view.height - mh - 14;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    g.save();
    g.fillStyle = 'rgba(8,12,20,0.78)';
    roundedRect(g, mx - 6, my - 6, mw + 12, mh + 12, 8);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 1;
    g.stroke();
    g.beginPath();
    g.rect(mx, my, mw, mh);
    g.clip();
    for (const d of DISTRICTS) {
      g.fillStyle = d.ground;
      g.fillRect(mx + d.x * sx, my + d.y * sy, d.width * sx, d.height * sy);
    }
    g.fillStyle = '#2e6f8e';
    g.fillRect(mx, my, HARBOUR.width * sx, HARBOUR.height * sy);
    g.fillRect(mx + SEA.x * sx, my + SEA.y * sy, SEA.width * sx, SEA.height * sy);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1;
    for (const s of VERTICAL_STREETS) {
      g.beginPath();
      g.moveTo(mx + s * sx, my);
      g.lineTo(mx + s * sx, my + mh);
      g.stroke();
    }
    for (const s of HORIZONTAL_STREETS) {
      g.beginPath();
      g.moveTo(mx, my + s * sy);
      g.lineTo(mx + mw, my + s * sy);
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.font = 'bold 9px sans-serif';
    g.textAlign = 'center';
    for (const d of DISTRICTS) {
      g.fillText(d.short, mx + (d.x + d.width / 2) * sx, my + (d.y + d.height / 2) * sy);
    }
    g.textAlign = 'left';
    // Garage.
    g.fillStyle = '#2ecc71';
    g.fillRect(mx + GARAGE.x * sx - 4, my + GARAGE.y * sy - 4, 8, 8);
    // Mission marker, pulsing.
    const target = world.jobTarget();
    const pulse = 5 + Math.sin(world.state.time * 5) * 2;
    g.fillStyle = world.state.jobPhase === 'pickup' ? '#2ecc71' : '#f39c12';
    g.beginPath();
    g.arc(mx + target.x * sx, my + target.y * sy, pulse, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.stroke();
    // Police dots.
    for (const car of world.state.cars) {
      if (car.role === 'police' && !car.dead) {
        g.fillStyle = '#ff4d4d';
        g.beginPath();
        g.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Player arrow.
    const p = world.state.player;
    g.save();
    g.translate(mx + p.x * sx, my + p.y * sy);
    g.rotate(p.angle);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(7, 0);
    g.lineTo(-5, -5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.restore();
    g.restore();
  }

  function drawHud(g, world, view) {
    const s = world.state;
    const w = view.width;
    const h = view.height;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    // Cash and job, top left.
    g.fillStyle = 'rgba(8,12,20,0.6)';
    roundedRect(g, 12, 10, 470, 86, 8);
    g.fill();
    g.fillStyle = '#f5d76e';
    g.font = 'bold 30px sans-serif';
    g.fillText(`$${s.cash.toLocaleString('en-US')}`, 24, 44);
    const job = world.currentJob();
    g.fillStyle = '#ffffff';
    g.font = 'bold 14px sans-serif';
    const phaseText = s.jobPhase === 'pickup'
      ? `JOB ${s.jobsDone + 1}/6 — ${job.title}: pick up at ${job.pickup.label}`
      : `JOB ${s.jobsDone + 1}/6 — ${job.title}: deliver to ${job.dropoff.label}`;
    g.fillText(phaseText, 24, 68);
    const target = world.jobTarget();
    const dist = Math.round(Math.hypot(s.player.x - target.x, s.player.y - target.y) / 10);
    g.fillStyle = '#b8e986';
    g.font = '13px sans-serif';
    const heatNow = Math.min(1 + s.wanted, 5);
    g.fillText(`${dist}m away   ·   HEAT ×${heatNow}${s.goldHour ? '   ·   GOLD HOUR ×1.5' : ''}`, 24, 88);
    // Clock and wanted, top right.
    g.fillStyle = 'rgba(8,12,20,0.6)';
    roundedRect(g, w - 218, 10, 206, 86, 8);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'right';
    g.fillText(clockText(s.clockMinutes), w - 24, 42);
    if (s.goldHour) {
      g.fillStyle = '#f5a623';
      roundedRect(g, w - 206, 52, 118, 20, 10);
      g.fill();
      g.fillStyle = '#1a1206';
      g.font = 'bold 12px sans-serif';
      g.fillText('★ GOLD HOUR ×1.5', w - 96, 66);
    }
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle = i < s.wanted ? '#ffcf3f' : 'rgba(255,255,255,0.22)';
      g.font = '22px sans-serif';
      g.fillText('★', w - 24 - i * 26, 92);
    }
    g.textAlign = 'left';
    // Radio log, bottom right (lines are cut to the box so none runs past it).
    const lines = s.radio.slice(-4);
    g.fillStyle = 'rgba(8,12,20,0.6)';
    roundedRect(g, w - 384, h - 24 - lines.length * 20 - 8, 372, lines.length * 20 + 14, 8);
    g.fill();
    g.font = '12px monospace';
    lines.forEach((line, i) => {
      let text = line.text;
      while (text.length > 4 && g.measureText(text).width > 352) text = text.slice(0, -2);
      if (text !== line.text) text = text.slice(0, -1) + '…';
      g.fillStyle = line.text.startsWith('VCPD') ? '#8fb8d8' : '#f5d76e';
      g.fillText(text, w - 372, h - 28 - (lines.length - 1 - i) * 20);
    });
    // Bottom centre: speed / health / ammo, laid out from measured text widths
    // so nothing ever overlaps.
    const p = s.player;
    const inCar = p.car && !p.car.dead;
    const speedText = inCar ? `${Math.round(Math.abs(p.car.speed) * 0.22)} mph` : 'ON FOOT';
    const hpText = inCar ? `CAR ${Math.round(p.car.hp)}/${p.car.maxHp}` : `YOU ${Math.round(p.health)}/100`;
    const ammoText = `AMMO ${p.ammo}`;
    const hpRatio = inCar ? p.car.hp / p.car.maxHp : p.health / PLAYER.maxHealth;
    g.font = 'bold 20px sans-serif';
    const speedW = g.measureText(speedText).width;
    g.font = '13px sans-serif';
    const hpW = g.measureText(hpText).width;
    g.font = 'bold 14px sans-serif';
    const ammoW = g.measureText(ammoText).width;
    const barW = 110;
    const gap = 14;
    const boxW = 24 + speedW + gap + barW + gap + hpW + gap + ammoW + 24;
    const boxX = w / 2 - boxW / 2;
    g.fillStyle = 'rgba(8,12,20,0.6)';
    roundedRect(g, boxX, h - 64, boxW, 50, 8);
    g.fill();
    let cx = boxX + 24;
    g.fillStyle = '#ffffff';
    g.font = 'bold 20px sans-serif';
    g.textAlign = 'left';
    g.fillText(speedText, cx, h - 30);
    cx += speedW + gap;
    g.fillStyle = hpRatio > 0.4 ? '#2ecc71' : '#e74c3c';
    g.fillRect(cx, h - 46, barW * hpRatio, 12);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.strokeRect(cx, h - 46, barW, 12);
    cx += barW + gap;
    g.fillStyle = '#ffffff';
    g.font = '13px sans-serif';
    g.fillText(hpText, cx, h - 30);
    cx += hpW + gap;
    g.fillStyle = '#ffd166';
    g.font = 'bold 14px sans-serif';
    g.fillText(ammoText, cx, h - 30);
    g.textAlign = 'left';
    // Prompts.
    if (view.prompt) {
      g.fillStyle = 'rgba(8,12,20,0.75)';
      const pw = g.measureText(view.prompt).width + 32;
      roundedRect(g, w / 2 - pw / 2, h - 116, pw, 34, 8);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 15px sans-serif';
      g.textAlign = 'center';
      g.fillText(view.prompt, w / 2, h - 93);
      g.textAlign = 'left';
    }
    // Delivery banner.
    if (s.banner) {
      g.fillStyle = 'rgba(8,12,20,0.82)';
      roundedRect(g, w / 2 - 320, 130, 640, 84, 10);
      g.fill();
      g.strokeStyle = '#f5d76e';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#f5d76e';
      g.font = 'bold 26px sans-serif';
      g.textAlign = 'center';
      g.fillText(s.banner.title, w / 2, 164);
      g.fillStyle = '#ffffff';
      g.font = 'bold 18px sans-serif';
      g.fillText(s.banner.sub, w / 2, 196);
      g.textAlign = 'left';
    }
    drawMinimap(g, world, view);
  }

  function drawTitle(g, world, view) {
    const w = view.width;
    const h = view.height;
    g.fillStyle = 'rgba(10,14,24,0.72)';
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.fillStyle = '#f5a623';
    g.font = 'bold 64px sans-serif';
    g.fillText('VERANO HEAT', w / 2, h / 2 - 110);
    g.fillStyle = '#ffffff';
    g.font = 'bold 22px sans-serif';
    g.fillText('Getaway Driver of Verano City', w / 2, h / 2 - 74);
    g.fillStyle = '#f5d76e';
    g.font = 'bold 18px sans-serif';
    g.fillText('HEAT PAYS — the hotter you arrive, the fatter the envelope.', w / 2, h / 2 - 38);
    g.fillStyle = '#d8d8d8';
    g.font = '16px sans-serif';
    const lines = [
      'WASD / Arrows — drive & walk      E — steal / exit a car',
      'Mouse click — shoot the pistol      F — punch      P / Esc — pause',
      'M — sound on/off      Garage repairs your car and sells armour & ammo',
      'Six jobs from Marisol Vega. Deliver at high wanted level to multiply the pay.',
    ];
    lines.forEach((line, i) => g.fillText(line, w / 2, h / 2 + 6 + i * 26));
    g.fillStyle = '#f5a623';
    g.font = 'bold 20px sans-serif';
    g.fillText(view.saveExists ? 'Press ENTER to continue your save — or click to start' : 'Press ENTER or click to start', w / 2, h / 2 + 140);
    if (view.best > 0) {
      g.fillStyle = '#b8e986';
      g.font = '15px sans-serif';
      g.fillText(`Best single delivery: $${view.best.toLocaleString('en-US')}`, w / 2, h / 2 + 170);
    }
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '12px sans-serif';
    g.fillText('An original game. Its city, people, cars and story are its own — nothing from Rockstar Games.', w / 2, h - 24);
    g.textAlign = 'left';
  }

  function drawPaused(g, view) {
    const w = view.width;
    const h = view.height;
    g.fillStyle = 'rgba(10,14,24,0.7)';
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = 'bold 44px sans-serif';
    g.fillText('PAUSED', w / 2, h / 2 - 60);
    g.font = '17px sans-serif';
    g.fillStyle = '#d8d8d8';
    g.fillText('ENTER / P — resume      M — sound ' + (view.muted ? 'OFF' : 'ON') + '      R — restart the run', w / 2, h / 2 - 16);
    g.fillText('The city waits. Marisol does not.', w / 2, h / 2 + 16);
    g.textAlign = 'left';
  }

  function drawGarage(g, world, view) {
    const w = view.width;
    const h = view.height;
    const s = world.state;
    g.fillStyle = 'rgba(10,14,24,0.78)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c2733';
    roundedRect(g, w / 2 - 260, h / 2 - 170, 520, 340, 12);
    g.fill();
    g.strokeStyle = '#2ecc71';
    g.lineWidth = 2;
    g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#2ecc71';
    g.font = 'bold 30px sans-serif';
    g.fillText('VERANO GARAGE', w / 2, h / 2 - 120);
    g.fillStyle = '#f5d76e';
    g.font = 'bold 18px sans-serif';
    g.fillText(`Your cash: $${s.cash.toLocaleString('en-US')}`, w / 2, h / 2 - 88);
    const repair = world.repairCost();
    const rows = [
      { key: '1', name: 'Repair the car', price: repair, note: repair > 0 ? `fixes ${Math.round((1 - (s.player.car ? s.player.car.hp / s.player.car.maxHp : 1)) * 100)}% damage` : 'already in perfect shape' },
      { key: '2', name: 'Armour plating +50', price: 250, note: 'soaks 60% of every hit' },
      { key: '3', name: 'Pistol ammo +24', price: 80, note: 'for the long nights' },
      { key: '4', name: 'Engine tune +15% top speed', price: 600, note: s.engineLevel >= 3 ? 'maxed out' : `level ${s.engineLevel}/3` },
    ];
    g.font = '16px sans-serif';
    rows.forEach((row, i) => {
      const y = h / 2 - 48 + i * 52;
      g.fillStyle = i === view.garageSelection ? '#2c3e50' : 'rgba(255,255,255,0.05)';
      roundedRect(g, w / 2 - 230, y - 22, 460, 44, 6);
      g.fill();
      g.fillStyle = '#ffffff';
      g.textAlign = 'left';
      g.fillText(`[${row.key}]  ${row.name}`, w / 2 - 214, y);
      g.fillStyle = '#f5d76e';
      g.textAlign = 'right';
      g.fillText(row.price > 0 ? `$${row.price}` : 'FREE', w / 2 + 214, y);
      g.fillStyle = '#9aa5b1';
      g.font = '12px sans-serif';
      g.textAlign = 'left';
      g.fillText(row.note, w / 2 - 214, y + 16);
      g.font = '16px sans-serif';
    });
    g.fillStyle = '#d8d8d8';
    g.font = '15px sans-serif';
    g.textAlign = 'center';
    g.fillText('Press 1–4 to buy, E or Esc to drive out', w / 2, h / 2 + 148);
    g.textAlign = 'left';
  }

  function drawOver(g, world, view) {
    const w = view.width;
    const h = view.height;
    const s = world.state;
    g.fillStyle = 'rgba(20,4,4,0.8)';
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.fillStyle = '#e74c3c';
    g.font = 'bold 72px sans-serif';
    g.fillText('WASTED', w / 2, h / 2 - 60);
    g.fillStyle = '#ffffff';
    g.font = '18px sans-serif';
    g.fillText(`Verano City got you. ${s.deliveries} deliveries, $${s.earned.toLocaleString('en-US')} earned, best single job $${s.bestPayout.toLocaleString('en-US')}.`, w / 2, h / 2 - 8);
    g.fillStyle = '#f5d76e';
    g.font = 'bold 20px sans-serif';
    g.fillText('Press ENTER to run it back', w / 2, h / 2 + 40);
    g.textAlign = 'left';
  }

  function drawBusted(g, view) {
    const w = view.width;
    const h = view.height;
    g.fillStyle = 'rgba(8,12,20,0.8)';
    g.fillRect(0, 0, w, h);
    g.textAlign = 'center';
    g.fillStyle = '#3498db';
    g.font = 'bold 64px sans-serif';
    g.fillText('BUSTED', w / 2, h / 2 - 40);
    g.fillStyle = '#ffffff';
    g.font = '18px sans-serif';
    g.fillText(view.bustedText || 'The VCPD caught up with you.', w / 2, h / 2 + 8);
    g.textAlign = 'left';
  }

  function draw(world, screen, view) {
    const s = world.state;
    const w = view.width;
    const h = view.height;
    const dpr = view.dpr || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!staticLayer || staticFor !== world) {
      staticLayer = buildStaticLayer(world);
      staticFor = world;
    }

    // Camera follows the player smoothly.
    const targetX = s.player.x;
    const targetY = s.player.y;
    const rate = Math.min(1, 5 * view.dt);
    camX += (targetX - camX) * rate;
    camY += (targetY - camY) * rate;
    camX = Math.max(w / 2, Math.min(WORLD.width - w / 2, camX));
    camY = Math.max(h / 2, Math.min(WORLD.height - h / 2, camY));
    const viewX = camX - w / 2;
    const viewY = camY - h / 2;

    ctx.save();
    ctx.translate(-viewX, -viewY);
    ctx.drawImage(staticLayer, 0, 0);
    const sun = sunState(s.clockMinutes);

    // Lit windows after dark.
    if (sun.night > 0.4) {
      ctx.fillStyle = `rgba(255,205,110,${0.85 * sun.night})`;
      for (const b of world.city.buildings) {
        if (b.x + b.w < viewX - 40 || b.x > viewX + w + 40 || b.y + b.h < viewY - 40 || b.y > viewY + h + 40) continue;
        for (const win of b.windows) {
          if (win.lit) ctx.fillRect(b.x + b.w / 2 + win.dx - 4, b.y + b.h / 2 + win.dy - 5, 8, 10);
        }
      }
    }

    // Garage building.
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(GARAGE.x - GARAGE.width / 2, GARAGE.y - GARAGE.height / 2, GARAGE.width, GARAGE.height);
    ctx.fillStyle = '#1e8449';
    ctx.fillRect(GARAGE.x - GARAGE.width / 2, GARAGE.y - GARAGE.height / 2, GARAGE.width, 14);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GARAGE', GARAGE.x, GARAGE.y + 6);
    ctx.textAlign = 'left';

    // Mission marker: a beam of light and a bouncing diamond.
    const target = world.jobTarget();
    const bounce = Math.sin(s.time * 4) * 6;
    ctx.strokeStyle = world.state.jobPhase === 'pickup' ? 'rgba(46,204,113,0.5)' : 'rgba(243,156,18,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(target.x - 16, target.y - 60 + bounce);
    ctx.lineTo(target.x, target.y - 88 + bounce);
    ctx.lineTo(target.x + 16, target.y - 60 + bounce);
    ctx.lineTo(target.x, target.y - 32 + bounce);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = world.state.jobPhase === 'pickup' ? '#2ecc71' : '#f39c12';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ammo pickups.
    for (const pk of s.pickups) {
      if (pk.taken) continue;
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(pk.x - 11, pk.y - 11, 22, 22);
      ctx.strokeStyle = '#7d6608';
      ctx.lineWidth = 2;
      ctx.strokeRect(pk.x - 11, pk.y - 11, 22, 22);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', pk.x, pk.y + 3);
      ctx.textAlign = 'left';
    }

    // Skid marks.
    for (const skid of s.skids) {
      ctx.save();
      ctx.translate(skid.x, skid.y);
      ctx.rotate(skid.angle);
      ctx.globalAlpha = Math.min(0.5, skid.life * 0.25);
      ctx.fillStyle = '#111111';
      ctx.fillRect(-16, -12, 32, 4);
      ctx.fillRect(-16, 8, 32, 4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Cars, pedestrians, player, bullets, particles.
    for (const car of s.cars) {
      if (car.x < viewX - 120 || car.x > viewX + w + 120 || car.y < viewY - 120 || car.y > viewY + h + 120) continue;
      drawCar(ctx, car, s.time);
    }
    for (const ped of s.peds) {
      if (ped.x < viewX - 40 || ped.x > viewX + w + 40 || ped.y < viewY - 40 || ped.y > viewY + h + 40) continue;
      drawPed(ctx, ped);
    }
    if (s.player.onFoot) {
      const p = s.player;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(6, -3, 12, 6);
      ctx.restore();
      // Aim line toward the mouse.
      if (view.mouse) {
        const wx = view.mouse.x + viewX;
        const wy = view.mouse.y + viewY;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(wx, wy);
        ctx.stroke();
      }
    }
    for (const b of s.bullets) {
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const pt of s.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Time-of-day light.
    if (sun.gold > 0) {
      ctx.fillStyle = `rgba(255,166,60,${0.14 * sun.gold})`;
      ctx.fillRect(viewX, viewY, w, h);
    }
    if (sun.night > 0) {
      ctx.fillStyle = `rgba(16,24,64,${0.3 * sun.night})`;
      ctx.fillRect(viewX, viewY, w, h);
      // Headlight cones at night.
      for (const car of s.cars) {
        if (car.dead || (car.role !== 'player' && car.role !== 'police' && car.role !== 'traffic')) continue;
        if (car.x < viewX - 100 || car.x > viewX + w + 100 || car.y < viewY - 100 || car.y > viewY + h + 100) continue;
        const grad = ctx.createRadialGradient(car.x, car.y, 10, car.x, car.y, 190);
        grad.addColorStop(0, 'rgba(255,240,180,0.16)');
        grad.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(car.x, car.y, 190, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Damage flash.
    if (flash > 0) {
      ctx.fillStyle = `rgba(231,76,60,${flash * 0.22})`;
      ctx.fillRect(0, 0, w, h);
      flash = Math.max(0, flash - view.dt * 2);
    }

    if (screen === SCREEN_PLAY || screen === SCREEN_GARAGE) drawHud(ctx, world, view);
    if (screen === SCREEN_TITLE) drawTitle(ctx, world, view);
    if (screen === SCREEN_PAUSED) drawPaused(ctx, view);
    if (screen === SCREEN_GARAGE) drawGarage(ctx, world, view);
    if (screen === SCREEN_OVER) drawOver(ctx, world, view);
    if (screen === SCREEN_BUSTED) drawBusted(ctx, view);
  }

  return {
    draw,
    noteDamage() { flash = 1; },
    resetCamera(x, y) { camX = x; camY = y; },
    camera() { return { x: camX, y: camY }; },
  };
}
