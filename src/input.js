// Unified input: keyboard + touch swipes. Emits high-level actions.

export const ACTIONS = {
  LEFT: 'left',
  RIGHT: 'right',
  JUMP: 'jump',
  ROLL: 'roll',
  PAUSE: 'pause',
};

export class Input {
  constructor() {
    this.handlers = [];
    this.touchStart = null;
    this.swipeThreshold = 28; // px before a swipe registers

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  attach(element = window) {
    window.addEventListener('keydown', this._onKeyDown);
    element.addEventListener('touchstart', this._onTouchStart, { passive: false });
    element.addEventListener('touchmove', this._onTouchMove, { passive: false });
    element.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this._element = element;
  }

  detach() {
    window.removeEventListener('keydown', this._onKeyDown);
    if (this._element) {
      this._element.removeEventListener('touchstart', this._onTouchStart);
      this._element.removeEventListener('touchmove', this._onTouchMove);
      this._element.removeEventListener('touchend', this._onTouchEnd);
    }
  }

  onAction(cb) {
    this.handlers.push(cb);
  }

  _emit(action) {
    for (const cb of this.handlers) cb(action);
  }

  _onKeyDown(e) {
    let action = null;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        action = ACTIONS.LEFT;
        break;
      case 'ArrowRight':
      case 'KeyD':
        action = ACTIONS.RIGHT;
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        action = ACTIONS.JUMP;
        break;
      case 'ArrowDown':
      case 'KeyS':
        action = ACTIONS.ROLL;
        break;
      case 'Escape':
      case 'KeyP':
        action = ACTIONS.PAUSE;
        break;
      default:
        return;
    }
    e.preventDefault();
    this._emit(action);
  }

  _onTouchStart(e) {
    const t = e.changedTouches[0];
    this.touchStart = { x: t.clientX, y: t.clientY, handled: false };
  }

  _onTouchMove(e) {
    if (!this.touchStart || this.touchStart.handled) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this.touchStart.x;
    const dy = t.clientY - this.touchStart.y;
    if (Math.abs(dx) < this.swipeThreshold && Math.abs(dy) < this.swipeThreshold) return;

    e.preventDefault();
    this.touchStart.handled = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      this._emit(dx > 0 ? ACTIONS.RIGHT : ACTIONS.LEFT);
    } else {
      this._emit(dy > 0 ? ACTIONS.ROLL : ACTIONS.JUMP);
    }
  }

  _onTouchEnd() {
    this.touchStart = null;
  }
}
