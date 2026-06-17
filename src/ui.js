// Thin wrapper around the DOM overlays and HUD.
export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      start: document.getElementById('start-screen'),
      pause: document.getElementById('pause-screen'),
      gameover: document.getElementById('gameover-screen'),
      loading: document.getElementById('loading'),
      score: document.getElementById('score-value'),
      coins: document.getElementById('coin-value'),
      finalScore: document.getElementById('final-score'),
      finalCoins: document.getElementById('final-coins'),
      best: document.getElementById('best-score'),
      pauseBtn: document.getElementById('pause-btn'),
    };
    this._lastScore = 0;
    this._lastCoins = 0;
  }

  bindButtons({ onPlay, onResume, onRestart, onPauseToggle }) {
    document.getElementById('play-btn').addEventListener('click', onPlay);
    document.getElementById('replay-btn').addEventListener('click', onRestart);
    document.getElementById('resume-btn').addEventListener('click', onResume);
    document.getElementById('restart-from-pause-btn').addEventListener('click', onRestart);
    this.el.pauseBtn.addEventListener('click', onPauseToggle);
  }

  _hideAll() {
    this.el.start.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.gameover.classList.add('hidden');
  }

  hideLoading() {
    this.el.loading.classList.add('hidden');
  }

  showMenu() {
    this._hideAll();
    this.el.hud.classList.add('hidden');
    this.el.start.classList.remove('hidden');
  }

  showHud() {
    this._hideAll();
    this.el.hud.classList.remove('hidden');
  }

  showPause() {
    this.el.pause.classList.remove('hidden');
  }

  showGameOver(score, coins, best) {
    this.el.gameover.classList.remove('hidden');
    this.el.finalScore.textContent = score;
    this.el.finalCoins.textContent = coins;
    this.el.best.textContent = best;
  }

  setScore(v) {
    if (v === this._lastScore) return;
    this._lastScore = v;
    this.el.score.textContent = v;
  }

  setCoins(v) {
    if (v === this._lastCoins) return;
    this._lastCoins = v;
    this.el.coins.textContent = v;
    this._bump(this.el.coins.parentElement);
  }

  setBest(v) {
    if (this.el.best) this.el.best.textContent = v;
  }

  _bump(node) {
    if (!node) return;
    node.classList.remove('bump');
    // force reflow so the animation can replay
    void node.offsetWidth;
    node.classList.add('bump');
  }
}
