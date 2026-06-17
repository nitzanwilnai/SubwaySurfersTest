import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';

const OBSTACLE = {
  BARRIER: 'barrier', // jump over
  LOW: 'low', // roll under
  TRAIN: 'train', // dodge to another lane
  RAMP: 'ramp', // jump onto / over
};

// Manages the endlessly-scrolling track, obstacles, coins and scenery.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.speed = CONFIG.baseSpeed;
    this.distance = 0;

    this.tiles = [];
    this.obstacles = []; // active obstacles { mesh, type, aabb, lane }
    this.coins = []; // active coins { mesh, collected }

    // Reuse fully-built meshes per type to avoid per-spawn allocation/leaks.
    this._pools = {
      [OBSTACLE.TRAIN]: [],
      [OBSTACLE.BARRIER]: [],
      [OBSTACLE.LOW]: [],
      [OBSTACLE.RAMP]: [],
    };
    this._coinPool = [];

    // Fixed dimensions so pooled meshes can be reused without rebuilding.
    this.trainLength = 18;

    this.spawnCursorZ = 0;
    this.rowGap = 11; // distance between candidate obstacle rows
    this.spawnDistance = CONFIG.visibleTiles * CONFIG.tileLength;

    this._buildMaterials();
    this._buildGround();
    this.reset();
  }

  _buildMaterials() {
    this.mat = {
      bed: new THREE.MeshStandardMaterial({ color: COLORS.gravel, roughness: 1 }),
      rail: new THREE.MeshStandardMaterial({ color: COLORS.rail, metalness: 0.8, roughness: 0.3 }),
      tie: new THREE.MeshStandardMaterial({ color: COLORS.tie, roughness: 1 }),
      side: new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }),
      coin: new THREE.MeshStandardMaterial({
        color: COLORS.coin,
        metalness: 0.6,
        roughness: 0.25,
        emissive: 0x6b4e00,
        emissiveIntensity: 0.4,
      }),
      barrier: new THREE.MeshStandardMaterial({ color: COLORS.barrier, roughness: 0.6 }),
      low: new THREE.MeshStandardMaterial({ color: COLORS.lowBarrier, roughness: 0.6 }),
      ramp: new THREE.MeshStandardMaterial({ color: 0x8a93b8, roughness: 0.7 }),
      buildingPalette: [0x1c2340, 0x232c52, 0x2c2150, 0x18324f, 0x301f3f].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })
      ),
    };
    this._trainMats = COLORS.trainBodies.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2 })
    );
  }

  _trackWidth() {
    return CONFIG.laneCount * CONFIG.laneWidth;
  }

  _laneX(lane) {
    const center = (CONFIG.laneCount - 1) / 2;
    return (lane - center) * CONFIG.laneWidth;
  }

  _buildGround() {
    const tileLen = CONFIG.tileLength;
    const total = CONFIG.visibleTiles + 2;
    const trackW = this._trackWidth();

    for (let i = 0; i < total; i++) {
      const tile = new THREE.Group();

      // Track bed
      const bed = new THREE.Mesh(new THREE.BoxGeometry(trackW + 0.6, 0.4, tileLen), this.mat.bed);
      bed.position.y = -0.2;
      bed.receiveShadow = true;
      tile.add(bed);

      // Rails (per lane edge) + ties
      for (let lane = 0; lane < CONFIG.laneCount; lane++) {
        const lx = this._laneX(lane);
        for (const off of [-0.55, 0.55]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, tileLen), this.mat.rail);
          rail.position.set(lx + off, 0.05, 0);
          tile.add(rail);
        }
      }
      const tieCount = 8;
      for (let t = 0; t < tieCount; t++) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(trackW + 0.2, 0.08, 0.5), this.mat.tie);
        tie.position.set(0, 0.0, -tileLen / 2 + (t + 0.5) * (tileLen / tieCount));
        tie.receiveShadow = true;
        tile.add(tie);
      }

      // Side platforms
      for (const dir of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, tileLen), this.mat.side);
        side.position.set(dir * (trackW / 2 + 1.7), -0.0, 0);
        side.receiveShadow = true;
        tile.add(side);
      }

      // Background buildings for speed perception
      this._decorateTile(tile, tileLen, trackW);

      tile.userData.length = tileLen;
      this.group.add(tile);
      this.tiles.push(tile);
    }
  }

  _decorateTile(tile, tileLen, trackW) {
    for (const dir of [-1, 1]) {
      const count = 2;
      for (let b = 0; b < count; b++) {
        const h = 3 + Math.random() * 9;
        const w = 1.6 + Math.random() * 1.6;
        const mat = this.mat.buildingPalette[(Math.random() * this.mat.buildingPalette.length) | 0];
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2 + Math.random() * 3), mat);
        building.position.set(
          dir * (trackW / 2 + 4 + Math.random() * 4),
          h / 2 - 0.4,
          -tileLen / 2 + Math.random() * tileLen
        );
        building.castShadow = false;
        building.receiveShadow = false;
        tile.add(building);
      }
    }
  }

  reset() {
    this.speed = CONFIG.baseSpeed;
    this.distance = 0;

    // Lay out ground tiles ahead of the player.
    const tileLen = CONFIG.tileLength;
    this.tiles.forEach((tile, i) => {
      tile.position.z = tileLen * 1.5 - i * tileLen;
    });

    // Recycle all active obstacles & coins.
    for (const o of this.obstacles) this._recycleObstacle(o);
    for (const c of this.coins) this._recycleCoin(c);
    this.obstacles = [];
    this.coins = [];

    // Start with a clear runway, then begin spawning ahead.
    this.spawnCursorZ = -CONFIG.tileLength * 2.5;
    while (this.spawnCursorZ > -this.spawnDistance) {
      this._spawnRow(this.spawnCursorZ);
      this.spawnCursorZ -= this.rowGap;
    }
  }

  // ---------- Obstacle / coin pooling ----------
  _recycleObstacle(o) {
    this.group.remove(o.mesh);
    this._pools[o.type].push(o.mesh);
  }

  _recycleCoin(c) {
    this.group.remove(c.mesh);
    this._coinPool.push(c.mesh);
  }

  _makeCoinMesh() {
    if (this._coinPool.length) return this._coinPool.pop();
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 18), this.mat.coin);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = false;
    return coin;
  }

  // ---------- Spawning ----------
  _spawnRow(z) {
    // Decide row content. Difficulty grows with distance.
    const difficulty = THREE.MathUtils.clamp(this.distance / 1200, 0, 1);
    const r = Math.random();

    // Choose how many lanes get blocked (never block all three at once).
    let blockedLanes = [];
    if (r < 0.18) {
      // empty-ish row, maybe a coin arc
    } else if (r < 0.55) {
      blockedLanes = [this._randLane()];
    } else if (r < 0.55 + 0.3 * difficulty + 0.1) {
      blockedLanes = this._pickTwoLanes();
    } else {
      blockedLanes = [this._randLane()];
    }

    const usedLanes = new Set();
    for (const lane of blockedLanes) {
      usedLanes.add(lane);
      this._spawnObstacle(lane, z, difficulty);
    }

    // Place a coin pattern on a free lane.
    const freeLanes = [];
    for (let l = 0; l < CONFIG.laneCount; l++) if (!usedLanes.has(l)) freeLanes.push(l);
    if (freeLanes.length && Math.random() < 0.8) {
      const lane = freeLanes[(Math.random() * freeLanes.length) | 0];
      this._spawnCoins(lane, z);
    }
  }

  _randLane() {
    return (Math.random() * CONFIG.laneCount) | 0;
  }

  _pickTwoLanes() {
    const a = this._randLane();
    let b = this._randLane();
    while (b === a) b = this._randLane();
    return [a, b];
  }

  _spawnObstacle(lane, z, difficulty) {
    const x = this._laneX(lane);
    const roll = Math.random();
    let type;
    if (roll < 0.34) type = OBSTACLE.TRAIN;
    else if (roll < 0.62) type = OBSTACLE.BARRIER;
    else if (roll < 0.85) type = OBSTACLE.LOW;
    else type = OBSTACLE.RAMP;

    const mesh = this._pools[type].pop() || this._buildObstacle(type);
    const o = { type, lane, mesh };

    if (type === OBSTACLE.TRAIN) {
      const len = this.trainLength;
      // Recolor the body so reused trains still feel varied.
      const mat = this._trainMats[(Math.random() * this._trainMats.length) | 0];
      mesh.userData.body.material = mat;
      mesh.position.set(x, 0, z - len / 2);
      o.aabb = { halfX: 1.1, minY: 0, maxY: 3.2, halfZ: len / 2 };
    } else if (type === OBSTACLE.BARRIER) {
      mesh.position.set(x, 0.5, z);
      o.aabb = { halfX: CONFIG.laneWidth * 0.4, minY: 0, maxY: 1.05, halfZ: 0.45 };
    } else if (type === OBSTACLE.LOW) {
      mesh.position.set(x, 0, z);
      o.aabb = { halfX: CONFIG.laneWidth * 0.45, minY: 1.25, maxY: 3.2, halfZ: 0.35 };
    } else {
      mesh.position.set(x, 0.65, z);
      o.aabb = { halfX: CONFIG.laneWidth * 0.39, minY: 0, maxY: 1.35, halfZ: 0.65 };
    }

    this.group.add(mesh);
    this.obstacles.push(o);
  }

  _buildObstacle(type) {
    switch (type) {
      case OBSTACLE.TRAIN:
        return this._buildTrain();
      case OBSTACLE.BARRIER:
        return this._buildBox(CONFIG.laneWidth * 0.8, 1.0, 0.7, this.mat.barrier, true);
      case OBSTACLE.LOW:
        return this._buildLowBarrier();
      case OBSTACLE.RAMP:
      default:
        return this._buildBox(CONFIG.laneWidth * 0.78, 1.3, 1.3, this.mat.ramp, true);
    }
  }

  _buildBox(w, h, d, mat, stripes = false) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    box.castShadow = true;
    box.receiveShadow = true;
    g.add(box);
    if (stripes) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.02, 0.16, d + 0.02),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      stripe.position.y = h * 0.18;
      g.add(stripe);
    }
    return g;
  }

  _buildLowBarrier() {
    const g = new THREE.Group();
    const w = CONFIG.laneWidth * 0.9;
    // bar to roll under, held up by two posts
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, 0.5), this.mat.low);
    bar.position.y = 1.9;
    bar.castShadow = true;
    g.add(bar);
    for (const dir of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.3, 0.18), this.mat.rail);
      post.position.set(dir * (w / 2 - 0.1), 1.15, 0);
      g.add(post);
    }
    return g;
  }

  _buildTrain() {
    const len = this.trainLength;
    const g = new THREE.Group();
    const mat = this._trainMats[(Math.random() * this._trainMats.length) | 0];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.6, len), mat);
    body.position.y = 1.45;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    g.userData.body = body;

    // Roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.3, len),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
    );
    roof.position.y = 2.8;
    g.add(roof);

    // Windows
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x0c1430,
      metalness: 0.4,
      roughness: 0.2,
      emissive: 0x101a3a,
    });
    const winCount = Math.max(2, Math.floor(len / 3));
    for (let i = 0; i < winCount; i++) {
      for (const dir of [-1, 1]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 1.4), winMat);
        win.position.set(dir * 0.96, 1.7, -len / 2 + 1.5 + i * (len / winCount));
        g.add(win);
      }
    }
    // Front face
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 2.3, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x11182f, roughness: 0.4 })
    );
    face.position.set(0, 1.5, len / 2);
    g.add(face);
    return g;
  }

  _spawnCoins(lane, z) {
    const x = this._laneX(lane);
    const count = 4 + ((Math.random() * 4) | 0);
    const arc = Math.random() < 0.4; // coins arc up over a jump
    for (let i = 0; i < count; i++) {
      const coin = this._makeCoinMesh();
      const cz = z - i * 1.4;
      let cy = 0.75;
      if (arc) {
        const t = i / (count - 1);
        cy = 0.75 + Math.sin(t * Math.PI) * 2.2;
      }
      coin.position.set(x, cy, cz);
      this.group.add(coin);
      this.coins.push({ mesh: coin, collected: false, spin: Math.random() * Math.PI });
    }
  }

  // ---------- Per-frame update ----------
  update(dt) {
    // Accelerate over time.
    this.speed = Math.min(CONFIG.maxSpeed, this.speed + CONFIG.speedRamp * dt);
    const dz = this.speed * dt;
    this.distance += dz;

    // Move ground tiles & recycle.
    const tileLen = CONFIG.tileLength;
    const recycleZ = tileLen * 2;
    for (const tile of this.tiles) {
      tile.position.z += dz;
      if (tile.position.z > recycleZ) {
        // find current min z and place behind it
        let minZ = Infinity;
        for (const t of this.tiles) minZ = Math.min(minZ, t.position.z);
        tile.position.z = minZ - tileLen;
      }
    }

    // Move obstacles & cull. Remember the pre-move z for swept collision.
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.prevZ = o.mesh.position.z;
      o.mesh.position.z += dz;
      if (o.mesh.position.z - (o.aabb.halfZ || 0) > recycleZ + 6) {
        this._recycleObstacle(o);
        this.obstacles.splice(i, 1);
      }
    }

    // Move coins, spin, cull.
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.mesh.position.z += dz;
      c.mesh.rotation.z += dt * 6;
      if (c.collected || c.mesh.position.z > recycleZ + 4) {
        this._recycleCoin(c);
        this.coins.splice(i, 1);
      }
    }

    // Generate more rows as the player advances.
    this.spawnCursorZ += dz;
    while (this.spawnCursorZ > -this.spawnDistance) {
      this._spawnRow(this.spawnCursorZ);
      this.spawnCursorZ -= this.rowGap;
    }
  }

  getScore() {
    return Math.floor(this.distance * CONFIG.distanceToScore);
  }
}

export { OBSTACLE };
