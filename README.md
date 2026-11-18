[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/5WanWan/gta6-01-r5/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/5WanWan/gta6-01-r5/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# VERANO HEAT — Getaway Driver of Verano City

An original open-world crime game for make.fun's gta6-01 ("Make GTA 6").
Its city, people, cars, story, art and sound are its own — nothing from
Rockstar Games or any other commercial game.

## The hook: HEAT PAYS

Every job pays its base amount times **(1 + your wanted level)** at the moment
of delivery, capped at ×5 — and during **Gold Hour** (17:00–18:00 in game) the
whole payout is multiplied by another ×1.5. A clean run pays. A hot run pays
more. A hot run in the golden light pays most of all.

## The game

- **Verano City, 3200×2400**: six districts (The Docks, Northgate, La Colina,
  Porto Verde, Centro, Solmar Beach), a diagonal boulevard (Avenida del Sol),
  a freeway ring, a harbour and a beach, on a full day cycle.
- **On foot and by car**: walk, run, punch, shoot the pistol; steal parked
  cars and traffic cars (the driver bails and runs).
- **Traffic and pedestrians**: 26 traffic cars that drive the street grid,
  brake for the car ahead and turn at intersections; 68 pedestrians who walk
  the sidewalks, flee gunfire and fast cars.
- **Wanted level 0–5 and police**: police chase, ram and (from 3 stars) shoot;
  from 4 stars they put up roadblocks. The level decays only while no police
  can see you. Get caught on foot and you are BUSTED — fines, and a walk from
  the garage.
- **Six story jobs from fixer Marisol Vega**: pick up, deliver, get paid —
  with the HEAT multiplier shown on the payout banner every time.
- **Garage**: repair, armour plating, pistol ammo and engine tunes, all bought
  with job money.
- **HUD**: cash, job objective with distance, clock with Gold Hour badge,
  wanted stars, speed / health / ammo, a labelled minimap, and a VCPD radio
  log. **Save**: cash, jobs, upgrades and best delivery persist in
  localStorage. **Sound**: fully synthesized with the Web Audio API — engine,
  sirens, a bass line, gunshots, crashes. No audio files.

## Controls

WASD / arrows — drive & walk · E — steal / exit a car (or open the garage) ·
Mouse click — shoot the pistol · F — punch · P / Esc — pause · M — sound ·
1–4 in the garage — buy.

## Play it

Serve `game/` with any static server (`node serve.ts`, then
http://localhost:8080) and open it in a desktop browser. No build step, no
network requests, no libraries — pure ES modules and canvas 2D.

`?seed=N` fixes the city and traffic. `?shot=chase|delivery|goldhour|foot`
stages a deterministic screenshot scene (the same seed always gives the same
frame) and sets `window.__shotReady` when painted.
