// Verano Heat — every tunable number and every fixed place in Verano City lives here,
// so the world, the renderer and the screenshots all agree on one map.

export const WORLD = { width: 3200, height: 2400 };

// The street grid. Every drivable street is a band centred on one of these lines;
// every intersection is one vertical line crossing one horizontal line. Missions,
// the garage, parked cars and the demo spawn are all placed on these lines, never
// inside a block, so nothing the game needs is ever unreachable.
export const VERTICAL_STREETS = [240, 560, 880, 1200, 1520, 1840, 2120];
export const HORIZONTAL_STREETS = [240, 560, 880, 1200, 1520, 1840, 2120];
export const STREET_HALF = 34; // half the asphalt width of a grid street
export const LANE_OFFSET = 11; // how far right of centre a car drives

// The diagonal boulevard runs from the harbour corner to the beach corner. It is a
// band of asphalt; buildings are never placed inside it.
export const BOULEVARD = {
  x0: 180, y0: 2220, x1: 3020, y1: 180, halfWidth: 46,
  name: 'Avenida del Sol',
};

// The freeway ring hugs the city edge. It is open road, no buildings inside it.
export const RING = { inset: 110, halfWidth: 36 };

// Water: the harbour bay in the north-west corner (west of the first street,
// north of the first street) and the sea in the south-east corner (past the last
// streets, so no street ever runs into the water).
export const HARBOUR = { x: 0, y: 0, width: 192, height: 192 };
export const SEA = { x: 2400, y: 2150, width: 800, height: 250 };

// Six districts. Each has a ground tint, a roof palette and a minimap label.
export const DISTRICTS = [
  { name: 'The Docks', short: 'DOCKS', x: 0, y: 0, width: 700, height: 700, ground: '#6b7a70', roofs: ['#7a6a58', '#6b5f52', '#857052'] },
  { name: 'Northgate', short: 'NORTHGATE', x: 700, y: 0, width: 1300, height: 700, ground: '#7d8f6a', roofs: ['#8a7a68', '#75655a', '#9a8a72'] },
  { name: 'La Colina', short: 'LA COLINA', x: 2000, y: 0, width: 1200, height: 700, ground: '#8a9678', roofs: ['#a08060', '#8f7a5c', '#b08a68'] },
  { name: 'Porto Verde', short: 'P. VERDE', x: 0, y: 700, width: 700, height: 1400, ground: '#77887a', roofs: ['#7d7268', '#6e6258', '#8a7d6a'] },
  { name: 'Centro', short: 'CENTRO', x: 700, y: 700, width: 1300, height: 1400, ground: '#857f74', roofs: ['#5e6b7d', '#6d5a6e', '#4f5f74', '#7d6b58'] },
  { name: 'Solmar Beach', short: 'SOLMAR', x: 2000, y: 700, width: 1200, height: 1700, ground: '#cbb28a', roofs: ['#d8b48a', '#c89a72', '#e0c090'] },
];

// The garage sits on the street corner at (1200, 560): its forecourt opens straight
// onto the intersection, so any car can drive in and out without crossing a block.
export const GARAGE = { x: 1200, y: 560, width: 150, height: 110, repairCost: 120, armorCost: 250, ammoCost: 80 };

// Player tuning.
export const PLAYER = {
  walkSpeed: 150,
  runSpeed: 235,
  radius: 13,
  maxHealth: 100,
  punchDamage: 25,
  punchRange: 42,
  punchArc: 1.1,
  pistolDamage: 34,
  pistolRange: 520,
  pistolAmmoStart: 24,
};

// Cars. hp is the health of a player-driven car; traffic cars use the same numbers.
export const CARS = {
  sedan: { length: 52, width: 26, topSpeed: 330, accel: 210, brake: 420, turn: 2.6, hp: 160 },
  taxi: { length: 52, width: 26, topSpeed: 345, accel: 225, brake: 430, turn: 2.7, hp: 150 },
  truck: { length: 74, width: 30, topSpeed: 260, accel: 150, brake: 340, turn: 1.9, hp: 240 },
  sports: { length: 54, width: 26, topSpeed: 430, accel: 300, brake: 520, turn: 3.1, hp: 140 },
  police: { length: 54, width: 26, topSpeed: 390, accel: 280, brake: 500, turn: 3.0, hp: 200 },
};

// Traffic and pedestrians.
export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 68;
export const PED_WALK_MIN = 38;
export const PED_WALK_MAX = 72;

// Wanted level. Stealing, hitting people and shooting raise it; it decays only
// while no police can see the player.
export const WANTED = {
  max: 5,
  decaySeconds: 26,
  policePerLevel: [0, 2, 3, 4, 5, 6],
  shootStars: 3, // police open fire from this level up
  roadblockStars: 4,
  ramDamagePerSecond: 7,
  bulletDamage: 4,
  bulletInterval: 1.25,
};

// HEAT PAYS: a delivery pays its base times (1 + wanted level at delivery), capped
// at x5, and Gold Hour multiplies the whole thing by 1.5.
export const HEAT_CAP = 5;
export const GOLD_HOUR_MULT = 1.5;

// The in-game clock: one game minute per real second. Gold Hour is 17:00-18:00.
export const CLOCK = { startMinutes: 16 * 60 + 22, minutesPerSecond: 1, goldStart: 17 * 60, goldEnd: 18 * 60 };

// Six story jobs from fixer Marisol Vega. Pickup and dropoff are intersections,
// so both ends are always reachable by road.
export const JOBS = [
  {
    title: 'Hot Papers',
    giver: 'Marisol Vega',
    intro: 'A courier envelope, no questions. Pick it up at the Docks gate and bring it to Centro. Keep it clean — or don\'t. Heat pays.',
    pickup: { x: 560, y: 240, label: 'Docks Gate' },
    dropoff: { x: 1200, y: 1200, label: 'Centro Plaza' },
    base: 350,
  },
  {
    title: 'The Solo Guitar',
    giver: 'Marisol Vega',
    intro: 'A 1962 guitar, one of one, in a case at La Colina. A buyer waits on the beach. Drive like the case is made of glass.',
    pickup: { x: 2120, y: 240, label: 'La Colina' },
    dropoff: { x: 2120, y: 1840, label: 'Solmar Beach' },
    base: 500,
  },
  {
    title: 'Cold Cash, Warm Engine',
    giver: 'Marisol Vega',
    intro: 'A duffel of small bills at Porto Verde. The buyer is at Northgate and he does not wait. Bring heat if you want — it pays.',
    pickup: { x: 240, y: 1520, label: 'Porto Verde' },
    dropoff: { x: 1200, y: 240, label: 'Northgate' },
    base: 650,
  },
  {
    title: 'The Witness',
    giver: 'Marisol Vega',
    intro: 'A nervous witness needs a ride from the harbour to a safe house in Centro. Nobody follows us. Nobody.',
    pickup: { x: 560, y: 560, label: 'Harbour Steps' },
    dropoff: { x: 1520, y: 1200, label: 'Safe House' },
    base: 800,
  },
  {
    title: 'Gold Hour Run',
    giver: 'Marisol Vega',
    intro: 'A crate of watches, timed for Gold Hour. Deliver it while the sun is low and the city glows — the buyer pays double for the light.',
    pickup: { x: 880, y: 1840, label: 'Porto Verde' },
    dropoff: { x: 2120, y: 560, label: 'La Colina' },
    base: 1000,
  },
  {
    title: 'The Last Getaway',
    giver: 'Marisol Vega',
    intro: 'One last job. A vault box from the Docks to the beach house, straight through the whole city. Bring everything you have.',
    pickup: { x: 240, y: 560, label: 'The Docks' },
    dropoff: { x: 2120, y: 2120, label: 'Beach House' },
    base: 1400,
  },
];

export const STEP = 1 / 60;
export const BEST_KEY = 'verano-heat-best';
export const SAVE_KEY = 'verano-heat-save-v1';

// Radio chatter lines the VCPD dispatcher and Marisol drop while the player plays.
export const RADIO_LINES = [
  'VCPD: all units, be advised, a stolen sedan was last seen near Centro.',
  'VCPD: unit 12, check the harbour gates, over.',
  'VCPD: traffic is heavy on Avenida del Sol, expect delays.',
  'Marisol: you are doing fine. The city likes you tonight.',
  'VCPD: caller reports a loud car on the freeway ring. Probably nothing.',
  'Marisol: remember — the hotter you arrive, the fatter the envelope.',
  'VCPD: units, keep the beach clear for the evening crowd.',
  'VCPD: a taxi driver says his fare ran off without paying. Again.',
];
