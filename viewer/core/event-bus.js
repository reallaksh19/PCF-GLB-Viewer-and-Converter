/**
 * event-bus.js — Minimal pub/sub for inter-module communication.
 *
 * Events used by the app:
 *   'file-loaded'     — new ACCDB text available in state
 *   'parse-complete'  — state.parsed updated
 *   'tab-changed'     — state.activeTab updated
 *   'scope-changed'   — state.scopeToggles updated
 *   'legend-changed'  — state.legendField updated
 *   'geo-toggle'      — state.geoToggles updated
 *   'load-pinned'     — state.pinnedLoadNodes updated
 */

const listeners = {};

export function on(event, fn) {
  (listeners[event] ??= []).push(fn);
}

export function off(event, fn) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(f => f !== fn);
}

export function emit(event, payload) {
  (listeners[event] ?? []).forEach(fn => fn(payload));
}
