import './styles.css';
import { Game } from './game.js';
import { UI } from './ui.js';

// Injected at build time from package.json (see vite.config.js).
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

function boot() {
  const canvas = document.getElementById('game-canvas');
  const ui = new UI();
  const game = new Game(canvas, ui);

  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = `v${APP_VERSION}`;

  ui.bindButtons({
    onPlay: () => game.start(),
    onResume: () => game.resume(),
    onRestart: () => game.start(),
    onPauseToggle: () => {
      if (game.state === 'playing') game.pause();
      else if (game.state === 'paused') game.resume();
    },
  });

  // Everything is procedural, so we're ready almost immediately.
  ui.hideLoading();
  ui.showMenu();

  // Expose for quick debugging in the console.
  window.__game = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
