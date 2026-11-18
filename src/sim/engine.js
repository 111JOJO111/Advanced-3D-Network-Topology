// Squelette du moteur (S1). Il expose déjà l'interface définitive — play, pause, step,
// setSpeed, reset, schedule, tick — pour que l'interface et le rendu puissent s'y brancher,
// mais il ne traite pas encore la file d'évènements (ce sera le travail de S2).

import { Topics } from './events.js';

export const SPEEDS = Object.freeze([0.5, 1, 2, 4]);

export const SimState = Object.freeze({
  READY: 'ready', PLAYING: 'playing', PAUSED: 'paused', FINISHED: 'finished',
});

const AVAILABLE = {
  play: ['ready', 'paused'],
  pause: ['playing'],
  step: ['ready', 'paused'],
  speed: ['ready', 'playing', 'paused', 'finished'],
  reset: ['ready', 'playing', 'paused', 'finished'],
};

/** Mini-bus provisoire, remplacé en S2 par src/sim/eventBus.js. */
export function createMiniBus() {
  const listeners = new Map();
  return {
    on(topic, listener) {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic).add(listener);
      return () => listeners.get(topic).delete(listener);
    },
    emit(topic, payload = {}) {
      for (const listener of listeners.get(topic) || []) listener(payload, topic);
    },
  };
}

export class Engine {
  constructor(bus = createMiniBus()) {
    this.bus = bus;
    this.queue = [];
    this.now = 0;
    this.speed = 1;
    this.state = SimState.READY;
    this.onReset = null;
    this.onIdle = null;
  }

  can(command) { return (AVAILABLE[command] || []).includes(this.state); }

  _set(state) {
    const previous = this.state;
    this.state = state;
    if (previous !== state) this.bus.emit(Topics.STATE, { state, previous });
  }

  /** Programme un évènement dans `delay` ms de temps simulé (traité à partir de S2). */
  schedule(delay, run) {
    this.queue.push({ time: this.now + delay, run });
    return this.queue.length;
  }

  play() { if (!this.can('play')) return false; this._set(SimState.PLAYING); return true; }
  pause() { if (!this.can('pause')) return false; this._set(SimState.PAUSED); return true; }
  step() { return this.can('step'); }

  setSpeed(speed) {
    if (!(speed > 0)) return false;
    this.speed = speed;
    this.bus.emit(Topics.SPEED, { speed });
    return true;
  }

  reset() {
    this.queue = [];
    this.now = 0;
    this._set(SimState.READY);
    if (this.onReset) this.onReset();
    this.bus.emit(Topics.RESET, {});
    this.bus.emit(Topics.CLOCK, { now: 0 });
    return true;
  }

  /** Appelé à chaque image avec le temps réel écoulé (ms). */
  tick(realDtMs) {
    if (this.state !== SimState.PLAYING) return;
    this.now += realDtMs * this.speed;
    this.bus.emit(Topics.CLOCK, { now: this.now });
  }
}
