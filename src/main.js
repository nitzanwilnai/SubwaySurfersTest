import './styles.css';
import { Game } from './game.js';
import { UI } from './ui.js';

function boot() {
  const canvas = document.getElementById('game-canvas');
  const ui = new UI();
  const game = new Game(canvas, ui);

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
