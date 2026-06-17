// Central game tuning constants.

export const CONFIG = {
  // Lanes
  laneCount: 3,
  laneWidth: 2.6,

  // Movement / speed
  baseSpeed: 14, // world units per second at start
  maxSpeed: 42,
  speedRamp: 0.45, // speed increase per second
  laneChangeSpeed: 12, // how fast the player slides between lanes

  // Jump / roll
  gravity: -52,
  jumpVelocity: 16,
  rollDuration: 0.6,

  // Player
  playerHeight: 1.7,
  playerRadius: 0.45,

  // Track generation
  tileLength: 20,
  visibleTiles: 9,
  spawnAhead: 6, // tiles ahead of the player that hold obstacles

  // Scoring
  distanceToScore: 1.0, // score points per world unit travelled
  coinValue: 1,

  // Camera
  cameraOffset: { x: 0, y: 5.2, z: 8.5 },
  cameraLookAhead: 8,
};

export const COLORS = {
  sky: 0x7ec8ff,
  fog: 0xbfe1ff,
  ground: 0x5b6488,
  rail: 0x9aa3c4,
  tie: 0x5a4a38,
  gravel: 0x4a5170,
  coin: 0xffcb2b,
  trainBodies: [0xff5d8f, 0x2bd9c9, 0xffa94d, 0x6c8cff, 0x9d6cff],
  barrier: 0xff4d4d,
  lowBarrier: 0xffd23f,
  player: 0x39d0ff,
  playerAccent: 0xffcb2b,
};
