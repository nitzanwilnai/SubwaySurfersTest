import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';
import { Player, PLAYER_STATE } from './player.js';
import { World } from './world.js';
import { Input, ACTIONS } from './input.js';

export const GAME_STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  CRASHING: 'crashing',
  OVER: 'over',
};

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.state = GAME_STATE.MENU;
    this.coins = 0;
    this.score = 0;
    this.bestScore = Number(localStorage.getItem('subwayRunnerBest') || 0);

    this._initRenderer();
    this._initScene();
    this._initCamera();
    this._initLights();

    this.world = new World(this.scene);
    this.player = new Player();
    this.scene.add(this.player.group);

    this.input = new Input();
    this.input.attach(this.canvas);
    this.input.onAction((a) => this._handleAction(a));

    this.clock = new THREE.Clock();
    this._tmpV = new THREE.Vector3();
    this.crashTimer = 0;
    this.shake = 0;

    window.addEventListener('resize', () => this._onResize());
    this._onResize();

    this.ui.setBest(this.bestScore);
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.fog, 60, 210);
  }

  _initCamera() {
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    const o = CONFIG.cameraOffset;
    this.camera.position.set(o.x, o.y, o.z);
    this.camera.lookAt(0, 1.5, -CONFIG.cameraLookAhead);
  }

  _initLights() {
    const hemi = new THREE.HemisphereLight(0xddf0ff, 0x55608a, 1.15);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff4dc, 1.7);
    sun.position.set(-12, 26, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 28;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0004;
    sun.target.position.set(0, 0, -6);
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- State transitions ----------
  start() {
    this.coins = 0;
    this.crashTimer = 0;
    this.shake = 0;
    this.world.reset();
    this.player.reset();
    this.clock.getDelta(); // flush any accumulated time
    this.state = GAME_STATE.PLAYING;
    this.ui.showHud();
    this.ui.setScore(0);
    this.ui.setCoins(0);
  }

  pause() {
    if (this.state !== GAME_STATE.PLAYING) return;
    this.state = GAME_STATE.PAUSED;
    this.ui.showPause();
  }

  resume() {
    if (this.state !== GAME_STATE.PAUSED) return;
    this.clock.getDelta();
    this.state = GAME_STATE.PLAYING;
    this.ui.showHud();
  }

  gameOver() {
    this.state = GAME_STATE.OVER;
    this.score = this.world.getScore();
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('subwayRunnerBest', String(this.bestScore));
    }
    this.ui.setBest(this.bestScore);
    this.ui.showGameOver(this.score, this.coins, this.bestScore);
  }

  _handleAction(action) {
    if (action === ACTIONS.PAUSE) {
      if (this.state === GAME_STATE.PLAYING) this.pause();
      else if (this.state === GAME_STATE.PAUSED) this.resume();
      return;
    }
    if (this.state !== GAME_STATE.PLAYING) return;
    switch (action) {
      case ACTIONS.LEFT:
        this.player.moveLeft();
        break;
      case ACTIONS.RIGHT:
        this.player.moveRight();
        break;
      case ACTIONS.JUMP:
        this.player.jump();
        break;
      case ACTIONS.ROLL:
        this.player.roll();
        break;
    }
  }

  // ---------- Main loop ----------
  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());

    if (this.state === GAME_STATE.PLAYING) {
      this.world.update(dt);
      this.player.update(dt);
      this._checkCollisions();
      this._updateScore();
    } else if (this.state === GAME_STATE.CRASHING) {
      // World is frozen so the recoil reads clearly; only the player animates.
      this.player.update(dt);
      this.crashTimer -= dt;
      if (this.crashTimer <= 0) this.gameOver();
    }

    this._updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _updateCamera(dt) {
    // Subtle lateral follow + speed-based pull-back.
    const targetX = this.player.group.position.x * 0.35;
    this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1, 6 * dt);

    // Decaying impact shake.
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const amt = this.shake * this.shake;
      sx = (Math.random() - 0.5) * amt;
      sy = (Math.random() - 0.5) * amt;
    }
    this.camera.position.y = CONFIG.cameraOffset.y + sy;
    this.camera.lookAt(this.camera.position.x * 0.5 + sx, 1.4 + sy, -CONFIG.cameraLookAhead);
  }

  _updateScore() {
    const s = this.world.getScore();
    this.ui.setScore(s);
  }

  _checkCollisions() {
    const col = this.player.getCollider();
    const px = this.player.group.position.x;

    // Obstacles
    for (const o of this.world.obstacles) {
      const oz = o.mesh.position.z;
      const a = o.aabb;
      if (Math.abs(oz) > a.halfZ + CONFIG.playerRadius) continue; // not aligned in depth
      if (Math.abs(o.mesh.position.x - px) > a.halfX + CONFIG.playerRadius) continue; // different lane
      // Vertical overlap?
      if (col.maxY > a.minY && col.minY < a.maxY) {
        this._crash(o.type);
        return;
      }
    }

    // Coins
    const centerY = (col.minY + col.maxY) / 2;
    for (const c of this.world.coins) {
      if (c.collected) continue;
      const m = c.mesh;
      if (Math.abs(m.position.z) > 0.9) continue;
      if (Math.abs(m.position.x - px) > 0.75) continue;
      if (Math.abs(m.position.y - centerY) > 1.4) continue;
      c.collected = true;
      this.coins += CONFIG.coinValue;
      this.ui.setCoins(this.coins);
    }
  }

  _crash(type) {
    if (!this.player.alive) return;
    this.player.alive = false;
    this.player.crash(type);
    // Trains throw you back harder and pause longer before the game-over card.
    const heavy = type === 'train';
    this.shake = heavy ? 1.0 : 0.7;
    this.crashTimer = heavy ? 0.95 : 0.7;
    this.state = GAME_STATE.CRASHING;
  }
}
