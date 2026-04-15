/**
 * viewer-3d-config.js - Resolver and validator for viewer3DConfig.
 */

import { DEFAULT_VIEWER3D_CONFIG, VIEWER_ACTION_IDS } from './viewer-3d-defaults.js';

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (!isObj(base)) return deepClone(patch);
  const out = deepClone(base);
  if (!isObj(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v)) out[k] = v.slice();
    else if (isObj(v) && isObj(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeVerticalAxis(value) {
  const axis = String(value || 'Z').toUpperCase();
  return axis === 'Y' ? 'Y' : 'Z';
}

function normalizeColorHex(value, fallback) {
  const s = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  return fallback;
}

function deepFreeze(obj) {
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return obj;
}

function normalizeCommon(cfg) {
  const c = deepMerge(DEFAULT_VIEWER3D_CONFIG, cfg || {});

  c.coordinateMap.verticalAxis = normalizeVerticalAxis(c.coordinateMap.verticalAxis);
  c.coordinateMap.axisConvention = c.coordinateMap.verticalAxis === 'Y' ? 'Y-up' : 'Z-up';
  if (String(c.coordinateMap.gridPlane || '').toLowerCase() === 'auto') {
    c.coordinateMap.gridPlane = c.coordinateMap.verticalAxis === 'Y' ? 'XZ' : 'XY';
  }

  c.camera.fov = clampNum(c.camera.fov, 20, 120, DEFAULT_VIEWER3D_CONFIG.camera.fov);
  c.camera.orthographicFrustum = clampNum(c.camera.orthographicFrustum, 100, 200000, DEFAULT_VIEWER3D_CONFIG.camera.orthographicFrustum);
  c.camera.fitPadding = clampNum(c.camera.fitPadding, 0.2, 4, DEFAULT_VIEWER3D_CONFIG.camera.fitPadding);
  c.controls.dampingFactor = clampNum(c.controls.dampingFactor, 0, 1, DEFAULT_VIEWER3D_CONFIG.controls.dampingFactor);
  c.controls.rotateSpeed = clampNum(c.controls.rotateSpeed, -10, 10, DEFAULT_VIEWER3D_CONFIG.controls.rotateSpeed);
  c.controls.panSpeed = clampNum(c.controls.panSpeed, 0.01, 10, DEFAULT_VIEWER3D_CONFIG.controls.panSpeed);
  c.controls.zoomSpeed = clampNum(c.controls.zoomSpeed, 0.01, 10, DEFAULT_VIEWER3D_CONFIG.controls.zoomSpeed);
  c.overlay.viewCubeSize = clampNum(c.overlay.viewCubeSize, 60, 240, DEFAULT_VIEWER3D_CONFIG.overlay.viewCubeSize);
  c.overlay.viewCubeOpacity = clampNum(c.overlay.viewCubeOpacity, 0.1, 1, DEFAULT_VIEWER3D_CONFIG.overlay.viewCubeOpacity);
  c.helpers.axisGizmoSize = clampNum(c.helpers.axisGizmoSize, 48, 200, DEFAULT_VIEWER3D_CONFIG.helpers.axisGizmoSize);

  c.componentPanel.selectionColor = normalizeColorHex(c.componentPanel.selectionColor, DEFAULT_VIEWER3D_CONFIG.componentPanel.selectionColor);
  c.componentPanel.hoverColor = normalizeColorHex(c.componentPanel.hoverColor, DEFAULT_VIEWER3D_CONFIG.componentPanel.hoverColor);
  c.heatmap.nullColor = normalizeColorHex(c.heatmap.nullColor, DEFAULT_VIEWER3D_CONFIG.heatmap.nullColor);
  c.legend.canvasLabels.fontSize = clampNum(c.legend.canvasLabels.fontSize, 8, 64, DEFAULT_VIEWER3D_CONFIG.legend.canvasLabels.fontSize);
  c.legend.canvasLabels.maxPerLabel = clampNum(c.legend.canvasLabels.maxPerLabel, 1, 10, DEFAULT_VIEWER3D_CONFIG.legend.canvasLabels.maxPerLabel);
  c.legend.canvasLabels.maxNodeLabels = clampNum(c.legend.canvasLabels.maxNodeLabels, 0, 200, DEFAULT_VIEWER3D_CONFIG.legend.canvasLabels.maxNodeLabels);
  c.heatmap.bucketCount = clampNum(c.heatmap.bucketCount, 2, 24, DEFAULT_VIEWER3D_CONFIG.heatmap.bucketCount);

  if (!Array.isArray(c.toolbar.order) || !c.toolbar.order.length) c.toolbar.order = [...VIEWER_ACTION_IDS];
  if (!Array.isArray(c.toolbar.visibleActions) || !c.toolbar.visibleActions.length) c.toolbar.visibleActions = [...VIEWER_ACTION_IDS];

  c.toolbar.order = c.toolbar.order.filter((id) => VIEWER_ACTION_IDS.includes(id));
  for (const id of VIEWER_ACTION_IDS) {
    if (!c.toolbar.order.includes(id)) c.toolbar.order.push(id);
  }
  c.toolbar.visibleActions = c.toolbar.visibleActions.filter((id) => VIEWER_ACTION_IDS.includes(id));

  return c;
}

export function getBaselineViewer3DConfig() {
  const baseline = normalizeCommon(DEFAULT_VIEWER3D_CONFIG);
  baseline.disableAllSettings = true;
  return deepFreeze(baseline);
}

export function getResolvedViewer3DConfig(config) {
  const source = config?.viewer3DConfig ? config.viewer3DConfig : config;
  const normalized = normalizeCommon(source || DEFAULT_VIEWER3D_CONFIG);
  if (normalized.disableAllSettings) {
    return getBaselineViewer3DConfig();
  }
  return deepFreeze(normalized);
}

export function updateViewer3DConfig(currentConfig, patch) {
  return deepMerge(currentConfig || DEFAULT_VIEWER3D_CONFIG, patch || {});
}
