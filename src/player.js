import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';

const STATE = {
  RUN: 'run',
  JUMP: 'jump',
  ROLL: 'roll',
  CRASH: 'crash',
};

// Builds and animates a stylized runner character from primitives.
export class Player {
  constructor() {
    this.group = new THREE.Group();
    this.lane = Math.floor(CONFIG.laneCount / 2); // start in the middle lane
    this.targetX = this._laneX(this.lane);
    this.group.position.set(this.targetX, 0, 0);

    this.state = STATE.RUN;
    this.velocityY = 0;
    this.rollTimer = 0;
    this.runCycle = 0;
    this.alive = true;
    this.crashVZ = 0;
    this.crashSpin = 0;

    this._build();
  }

  _laneX(lane) {
    const center = (CONFIG.laneCount - 1) / 2;
    return (lane - center) * CONFIG.laneWidth;
  }

  _build() {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: COLORS.player,
      roughness: 0.45,
      metalness: 0.1,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: COLORS.playerAccent,
      roughness: 0.4,
      metalness: 0.1,
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd9a8, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2f4a, roughness: 0.6 });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 0.42), bodyMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    this.group.add(torso);
    this.torso = torso;

    // Backpack
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), accentMat);
    pack.position.set(0, 1.1, -0.32);
    pack.castShadow = true;
    this.group.add(pack);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), skinMat);
    head.position.y = 1.78;
    head.castShadow = true;
    this.group.add(head);

    // Cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), accentMat);
    cap.position.y = 1.86;
    this.group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.22), accentMat);
    brim.position.set(0, 1.82, 0.28);
    this.group.add(brim);

    // Arms (pivot at shoulder so they swing naturally)
    this.armL = this._makeLimb(0.16, 0.7, bodyMat, skinMat);
    this.armL.position.set(-0.46, 1.45, 0);
    this.group.add(this.armL);

    this.armR = this._makeLimb(0.16, 0.7, bodyMat, skinMat);
    this.armR.position.set(0.46, 1.45, 0);
    this.group.add(this.armR);

    // Legs
    this.legL = this._makeLimb(0.2, 0.75, darkMat, darkMat);
    this.legL.position.set(-0.2, 0.65, 0);
    this.group.add(this.legL);

    this.legR = this._makeLimb(0.2, 0.75, darkMat, darkMat);
    this.legR.position.set(0.2, 0.65, 0);
    this.group.add(this.legR);

    // Shadow blob (cheap fake shadow under the player)
    const shadowTex = this._makeShadowTexture();
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 })
    );
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.02;
    this.group.add(this.blob);
  }

  _makeLimb(w, len, topMat, botMat) {
    const limb = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), topMat);
    upper.position.y = -len / 2;
    upper.castShadow = true;
    limb.add(upper);
    return limb;
  }

  _makeShadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  reset() {
    this.lane = Math.floor(CONFIG.laneCount / 2);
    this.targetX = this._laneX(this.lane);
    this.group.position.set(this.targetX, 0, 0);
    this.state = STATE.RUN;
    this.velocityY = 0;
    this.rollTimer = 0;
    this.alive = true;
    this.crashVZ = 0;
    this.crashSpin = 0;
    this.group.rotation.set(0, 0, 0);
    this.group.scale.set(1, 1, 1);
    this._resetLimbs();
  }

  _resetLimbs() {
    for (const limb of [this.legL, this.legR, this.armL, this.armR]) {
      if (limb) limb.rotation.set(0, 0, 0);
    }
  }

  moveLeft() {
    if (this.lane > 0) {
      this.lane--;
      this.targetX = this._laneX(this.lane);
    }
  }

  moveRight() {
    if (this.lane < CONFIG.laneCount - 1) {
      this.lane++;
      this.targetX = this._laneX(this.lane);
    }
  }

  jump() {
    if (this.state === STATE.RUN || this.state === STATE.ROLL) {
      this.state = STATE.JUMP;
      this.velocityY = CONFIG.jumpVelocity;
      this.rollTimer = 0;
    }
  }

  roll() {
    if (this.state === STATE.CRASH) return;
    if (this.state === STATE.JUMP) {
      // Fast-fall + roll if airborne
      this.velocityY = -CONFIG.jumpVelocity;
    }
    this.state = STATE.ROLL;
    this.rollTimer = CONFIG.rollDuration;
  }

  // Knock the runner back off a solid obstacle. Trains hit hardest.
  crash(type) {
    this.state = STATE.CRASH;
    const heavy = type === 'train';
    this.group.scale.set(1, 1, 1);
    this._duckOffset = 0;
    this.crashVZ = heavy ? 6.5 : 4; // recoil toward the camera (+z)
    this.velocityY = heavy ? 6.5 : 4.5; // little pop into the air
    this.crashSpin = (Math.random() < 0.5 ? -1 : 1) * (heavy ? 6 : 3.5);
  }

  // The collision box changes depending on the state.
  getCollider() {
    const x = this.group.position.x;
    const y = this.group.position.y;
    const half = CONFIG.playerRadius;
    if (this.state === STATE.ROLL) {
      return { minX: x - half, maxX: x + half, minY: y, maxY: y + 0.7, z: this.group.position.z };
    }
    return {
      minX: x - half,
      maxX: x + half,
      minY: y,
      maxY: y + CONFIG.playerHeight,
      z: this.group.position.z,
    };
  }

  update(dt) {
    if (this.state === STATE.CRASH) {
      this._updateCrash(dt);
      return;
    }

    // Lateral lane interpolation
    const dx = this.targetX - this.group.position.x;
    this.group.position.x += dx * Math.min(1, CONFIG.laneChangeSpeed * dt);

    // Bank slightly while changing lanes
    this.group.rotation.z = THREE.MathUtils.clamp(-dx * 0.25, -0.35, 0.35);

    if (this.state === STATE.JUMP) {
      this.velocityY += CONFIG.gravity * dt;
      this.group.position.y += this.velocityY * dt;
      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.velocityY = 0;
        this.state = STATE.RUN;
      }
    } else if (this.state === STATE.ROLL) {
      this.rollTimer -= dt;
      // allow falling if rolled mid-air
      if (this.group.position.y > 0) {
        this.velocityY += CONFIG.gravity * dt;
        this.group.position.y = Math.max(0, this.group.position.y + this.velocityY * dt);
      }
      if (this.rollTimer <= 0 && this.group.position.y <= 0) {
        this.state = STATE.RUN;
        this.velocityY = 0;
      }
    }

    this._animate(dt);
  }

  _updateCrash(dt) {
    // Ballistic recoil away from the obstacle with a tumble.
    this.velocityY += CONFIG.gravity * dt;
    this.group.position.y += this.velocityY * dt;
    this.group.position.z += this.crashVZ * dt;
    this.crashVZ *= Math.max(0, 1 - 5 * dt); // air drag so it settles quickly

    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velocityY *= -0.35; // small bounce on landing
      if (Math.abs(this.velocityY) < 1.5) this.velocityY = 0;
    }

    this.group.rotation.x += this.crashSpin * dt;
    this.crashSpin *= Math.max(0, 1 - 2 * dt);
    this.group.rotation.z *= Math.max(0, 1 - 6 * dt);

    // Flail the limbs.
    this.legL.rotation.x = -0.8;
    this.legR.rotation.x = 0.8;
    this.armL.rotation.x = -2.4;
    this.armR.rotation.x = -2.0;

    this.blob.position.y = 0.02 - this.group.position.y;
    const shrink = THREE.MathUtils.clamp(1 - this.group.position.y * 0.12, 0.3, 1);
    this.blob.scale.set(shrink, shrink, shrink);
  }

  _animate(dt) {
    const ducking = this.state === STATE.ROLL ? 1 : 0;
    // Smoothly squash the body when rolling
    const targetScaleY = ducking ? 0.5 : 1;
    const targetPosY = ducking ? 0.42 : 0;
    this.group.scale.y += (targetScaleY - this.group.scale.y) * Math.min(1, 18 * dt);
    this._duckOffset = (this._duckOffset ?? 0) + (targetPosY - (this._duckOffset ?? 0)) * Math.min(1, 18 * dt);

    if (this.state === STATE.RUN || this.state === STATE.ROLL) {
      this.runCycle += dt * (this.state === STATE.ROLL ? 22 : 14);
      const swing = Math.sin(this.runCycle) * 0.9;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
    } else if (this.state === STATE.JUMP) {
      // Tuck limbs during the jump
      this.legL.rotation.x = THREE.MathUtils.lerp(this.legL.rotation.x, -0.6, 10 * dt);
      this.legR.rotation.x = THREE.MathUtils.lerp(this.legR.rotation.x, -0.6, 10 * dt);
      this.armL.rotation.x = THREE.MathUtils.lerp(this.armL.rotation.x, -2.2, 10 * dt);
      this.armR.rotation.x = THREE.MathUtils.lerp(this.armR.rotation.x, -2.2, 10 * dt);
    }

    // keep blob shadow tied to ground regardless of jump height
    this.blob.position.y = 0.02 - this.group.position.y;
    const shrink = THREE.MathUtils.clamp(1 - this.group.position.y * 0.12, 0.4, 1);
    this.blob.scale.set(shrink, shrink, shrink);
  }
}

export { STATE as PLAYER_STATE };
