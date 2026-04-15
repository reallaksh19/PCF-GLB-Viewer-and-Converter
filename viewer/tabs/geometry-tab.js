/**
 * geometry-tab.js — Wires the geometry tab UI controls to IsometricRenderer.
 */

import { state } from '../core/state.js';
import { unitSuffix } from '../utils/formatter.js';
import { emit, on } from '../core/event-bus.js';
import { renderLogPanel, destroyLogPanel } from './log-panel.js';
import { renderSettingsPanel } from '../geometry/viewer-settings.js';
import { parsePcfText } from '../js/pcf2glb/pcf/parsePcfText.js';
import { normalizePcfModel } from '../js/pcf2glb/pcf/normalizePcfModel.js';

// Inline legend colours — avoids static Three.js import at module load time
const OD_COLORS = [
  { od: 406.4,   color: 0xe07020, label: 'Ã˜406.4 mm' },
  { od: 323.85,  color: 0x1a6ec7, label: 'Ã˜323.85 mm' },
  { od: 168.275, color: 0x1a9c7a, label: 'Ã˜168.275 mm' },
];

let _renderer = null;
let _initialized = false;
let _settingsSyncRegistered = false;

/**
 * Render the geometry tab shell (canvas + controls).
 * The IsometricRenderer is created lazily on first render.
 */
export async function renderGeometry(container) {
  const themeClass = `geo-theme-${String(state.viewerSettings.themePreset || 'NavisDark').toLowerCase()}`;
  container.innerHTML = `
    <div class="geo-tab ${themeClass}" id="section-geometry">
      <div class="geo-toolbar">
          
          <div data-testid="geometry-listener-count" style="display:none;">1</div>
          <!-- Main Toolbar Buttons -->
          <button class="btn-icon" data-mode="select" title="Select [S]"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5.5 3.5L5.5 17L9 13L12 19.5L14.2 18.5L11.2 12L16.5 12Z"/></svg></button>
          <button class="btn-icon active" data-mode="orbit" title="3D Orbit [O]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-20 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(70 12 12)"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><path d="M17.5 6.5 L20 10 L16.5 10.2" fill="currentColor" stroke="none"/></svg></button>
          <button class="btn-icon" data-mode="plan" title="Plan / Roll View [X]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M5 12 A7 7 0 1 1 12 19"/><polyline points="10,17 12,19 10,21" fill="currentColor" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="5" x2="12" y2="19" stroke-dasharray="3,2"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><text x="3" y="10" font-size="5.5" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">X</text></svg></button>
          <button class="btn-icon" data-mode="rotateY" title="Rotate about Y [Y]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><ellipse cx="12" cy="12" rx="3.5" ry="8"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="3,2" stroke-width="1.2"/><polyline points="10,4.2 12,3 13.5,5" fill="currentColor" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><text x="14.5" y="10" font-size="5.5" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">Y</text></svg></button>
          <button class="btn-icon" data-mode="rotateZ" title="Rotate about Z [Z]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><ellipse cx="12" cy="12" rx="8" ry="3.5"/><line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="3,2" stroke-width="1.2"/><polyline points="14.2,10 13,12 15,13.5" fill="currentColor" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><text x="10" y="20.5" font-size="5.5" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">Z</text></svg></button>
          <button class="btn-icon" data-mode="pan" title="Pan [P]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M12 5v14m-7-7h14m-14 0l3-3m-3 3l3 3m11-3l-3-3m3 3l-3 3M12 5l-3 3m3-3l3 3m-3 14l-3-3m3 3l3-3"/></svg></button>

          <div class="toolbar-divider"></div>

          <button class="btn-icon" id="btn-fit-all" title="Fit All [H]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M8 8h8v8H8z"/></svg></button>
          <button class="btn-icon" id="btn-fit-sel" title="Fit Selection [F]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="7" y="7" width="10" height="10" rx="1" ry="1"/><circle cx="12" cy="12" r="2"/></svg></button>
          <button class="btn-icon" id="btn-proj" title="Toggle Projection [V]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M4 4h16v16H4z M4 4l5 5 M20 4l-5 5 M4 20l5-5 M20 20l-5-5"/></svg></button>
          <button class="btn-icon" id="btn-section" title="Section Box [B]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><rect x="4" y="4" width="16" height="16" stroke-dasharray="4 2"/><path d="M4 12h16"/></svg></button>
          <button class="btn-icon" id="btn-fly" title="Fly Mode [F9]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M22 12l-10 8-2-4L2 15l2-9h4l2 4 8-2z"/></svg></button>

          <div class="toolbar-divider" style="margin-top:auto"></div>
          <button class="btn-icon" id="btn-settings" title="Settings [,]"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
      </div>

      <div class="geo-main-area">
          <div class="geo-top-controls">
            <label class="btn-secondary file-label">
              <input type="file" id="geometry-pcf-input" accept=".pcf,.PCF" style="display:none">
              Load .PCF
            </label>
            <label class="control-label" style="margin-left:auto;">
              Legend:
              <select id="legend-select">
                <option value="none">None</option>
                <option value="pipelineRef">Legends</option>
                <option value="material">Material</option>
                <option value="T1">T1${unitSuffix(state.parsed?.units?.temperature)}</option>
                <option value="T2">T2${unitSuffix(state.parsed?.units?.temperature)}</option>
                <option value="P1">P1${unitSuffix(state.parsed?.units?.pressure)}</option>
              </select>
            </label>

            <label class="control-label">
              Heat Map:
              <select id="heatmap-select">
                <option value="None">None</option>
                <option value="HeatMap:T1">Heat Map: T1</option>
                <option value="HeatMap:T2">Heat Map: T2</option>
                <option value="HeatMap:P1">Heat Map: P1</option>
              </select>
            </label>

            <label class="control-label" style="margin-left: 12px; border-left: 1px solid #ccc; padding-left: 12px;">
              <input type="checkbox" id="tog-labels-quick" ${state.viewerSettings?.showLabels ? 'checked' : ''}> Show Labels
            </label>
            <label class="control-label">
              <input type="checkbox" id="tog-support-labels-quick" ${state.viewerSettings?.showRestraintNames ? 'checked' : ''}> Show Support Labels
            </label>
            <label class="control-label">
              Label Mode:
              <select id="label-mode-quick">
                <option value="smart-density" ${state.viewerSettings?.labelMode === 'smart-density' ? 'selected' : ''}>Smart Density</option>
                <option value="run-only" ${state.viewerSettings?.labelMode === 'run-only' ? 'selected' : ''}>Run Only</option>
                <option value="all" ${state.viewerSettings?.labelMode === 'all' ? 'selected' : ''}>All</option>
                <option value="none" ${state.viewerSettings?.labelMode === 'none' ? 'selected' : ''}>None</option>
              </select>
            </label>
            <button class="btn-secondary" id="btn-display-all" style="margin-left:auto;">Display All</button>
          </div>

          <div class="geo-body">
            <div class="canvas-wrap" id="canvas-wrap">
              <div class="canvas-placeholder" id="canvas-placeholder">
                Load an .ACCDB file or .PCF file to render the model
              </div>
            </div>

            <!-- Right side panel area -->
            <div class="geo-side-panel">
                <div class="side-panel-tabs">
                    <button class="panel-tab active" data-target="panel-props">Props</button>
                    <button class="panel-tab" data-target="panel-rests">Restraints</button>
                    <button class="panel-tab" data-target="panel-legend">Legend</button>
                </div>

                <div class="panel-content active" id="panel-props">
                    <div class="panel-placeholder">Select an object to inspect</div>
                </div>

                <div class="panel-content" id="panel-rests">
                    <!-- Placeholder for Restraints Tab -->
                    <div class="panel-placeholder">Loading Restraints...</div>
                </div>

                <div class="panel-content" id="panel-legend">
                    <div class="geo-legend-panel" id="legend-panel">
                        <div class="legend-title">OD Legend</div>
                        ${OD_COLORS.map(c => `
                          <div class="legend-row">
                            <span class="legend-swatch" style="background:#${c.color.toString(16).padStart(6,'0')}"></span>
                            <span>${c.label}</span>
                          </div>
                        `).join('')}
                        <div class="legend-row"><span class="legend-swatch swatch-anchor"></span><span>Anchor ■</span></div>
                        <div class="legend-row"><span class="legend-swatch swatch-guide"></span><span>Guide ○</span></div>
                        <div class="legend-row"><span class="legend-swatch swatch-load"></span><span>Applied Load ↓</span></div>
                    </div>
                </div>
            </div>

            <div id="settings-drawer-container" style="display:none;"></div>
          </div>

          <div class="geo-status" id="geo-status">
            <span id="geo-status-text">Ready</span>
            <span id="geo-version-text" style="opacity:0.6;">ver.01-01-24 12.00</span>
          </div>
          <div id="log-panel-container"></div>
      </div>
    </div>
  `;

  _wireControls(container);
  _syncLabelQuickControls(container);

  if (!_settingsSyncRegistered) {
    on('viewer-settings-changed', () => {
      const currentContainer = document.getElementById('tab-content');
      if (state.activeTab === 'geometry' && currentContainer) {
        _syncLabelQuickControls(currentContainer);
      }
    });
    _settingsSyncRegistered = true;
  }

  const logContainer = container.querySelector('#log-panel-container');
  if (logContainer) {
      renderLogPanel(logContainer);
  }

  // Always init renderer, so Axis Gizmo is ready, even if no data yet.
  await _ensureRenderer(container);

  const activeData = _getGeometryData();
  if (activeData) {
    _setStatus(container, `${activeData?.elements?.length ?? 0} elements · ${Object.keys(activeData?.nodes ?? {}).length} nodes`);
    _renderer?.rebuild();
  }

  on('parse-complete', async () => {
    state.geometryDirectData = null;
    await _ensureRenderer(container);
    _setStatus(container, `${state.parsed?.elements?.length ?? 0} elements · ${Object.keys(state.parsed?.nodes ?? {}).length} nodes`);
    _renderer?.rebuild();
  });
}

async function _ensureRenderer(container) {
  const wrap = container.querySelector('#canvas-wrap');
  const placeholder = container.querySelector('#canvas-placeholder');
  if (!wrap) return;

  // Remove placeholder
  if (placeholder) placeholder.remove();

  if (_renderer && _initialized) {
    // If returning to the tab, re-parent the existing renderer DOM elements
    if (_renderer._renderer && _renderer._renderer.domElement) {
        wrap.appendChild(_renderer._renderer.domElement);
    }
    if (_renderer._css2d && _renderer._css2d.domElement) {
        wrap.appendChild(_renderer._css2d.domElement);
    }
    if (_renderer._navOverlayEl) {
      wrap.appendChild(_renderer._navOverlayEl);
    }
    if (_renderer._viewCubeEl) {
      wrap.appendChild(_renderer._viewCubeEl);
    }
    if (_renderer._gizmoEl) {
      wrap.appendChild(_renderer._gizmoEl);
    }

    // We must update the renderer's internal container reference to the NEW DOM node
    // since the old `wrap` was destroyed during tab unmount.
    _renderer._container = wrap;
    _renderer._onResize(); // Adjust size
    return;
  }

  // Lazy import to avoid loading Three.js until needed
  const { IsometricRenderer } = await import('../geometry/isometric-renderer.js');
  _renderer = new IsometricRenderer(wrap);
  _initialized = true;
}

function _wireControls(container) {
  container.querySelector('#geometry-pcf-input')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
          const text = await file.text();
          state.geometryDirectData = _buildDirectGeometryData(text, file.name);
          _setStatus(container, `${state.geometryDirectData.elements.length} elements · ${Object.keys(state.geometryDirectData.nodes || {}).length} nodes`);
          await _ensureRenderer(container);
          _renderer?.rebuild();
      } catch (error) {
          console.error(error);
          alert(`Failed to load PCF: ${String(error?.message || error)}`);
      } finally {
          event.target.value = '';
      }
  });

  const toolBtns = container.querySelectorAll('.btn-icon[data-mode]');
  toolBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
          toolBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const mode = btn.dataset.mode;
          if (_renderer && _renderer.setNavMode) {
              _renderer.setNavMode(mode);
          }
      });
  });

  container.querySelector('#btn-fit-all')?.addEventListener('click', () => _renderer?.resetView());
  container.querySelector('#btn-proj')?.addEventListener('click', () => _renderer?.toggleProjection());

  // Settings Drawer toggle
  const settingsBtn = container.querySelector('#btn-settings');
  const settingsDrawer = container.querySelector('#settings-drawer-container');
  if (settingsBtn && settingsDrawer) {
      renderSettingsPanel(settingsDrawer);
      settingsBtn.addEventListener('click', () => {
          settingsDrawer.style.display = settingsDrawer.style.display === 'none' ? 'block' : 'none';
      });
      on('settings-drawer-closed', () => {
          settingsDrawer.style.display = 'none';
      });
  }

  // Side Panel Tabs
  const panelTabs = container.querySelectorAll('.panel-tab');
  const panelContents = container.querySelectorAll('.panel-content');
  panelTabs.forEach(tab => {
      tab.addEventListener('click', () => {
          panelTabs.forEach(t => t.classList.remove('active'));
          panelContents.forEach(c => c.classList.remove('active'));
          tab.classList.add('active');
          container.querySelector(`#${tab.dataset.target}`).classList.add('active');
      });
  });

  container.querySelector('#legend-select')?.addEventListener('change', e => {
    state.legendField = e.target.value;
    const heatMapSelect = container.querySelector('#heatmap-select');
    if (heatMapSelect) heatMapSelect.value = 'None';
    emit('legend-changed', state.legendField);
  });

  container.querySelector('#heatmap-select')?.addEventListener('change', e => {
    if (e.target.value === 'None') {
       const legendSelect = container.querySelector('#legend-select');
       state.legendField = legendSelect ? legendSelect.value : 'none';
    } else {
       state.legendField = e.target.value;
    }
    emit('legend-changed', state.legendField);
  });

  container.querySelector('#tog-labels-quick')?.addEventListener('change', e => {
      state.viewerSettings.showLabels = e.target.checked;
      emit('viewer-settings-changed', { key: 'showLabels', value: e.target.checked });
  });

  container.querySelector('#tog-support-labels-quick')?.addEventListener('change', e => {
      state.viewerSettings.showRestraintNames = e.target.checked;
      emit('viewer-settings-changed', { key: 'showRestraintNames', value: e.target.checked });
  });

  container.querySelector('#label-mode-quick')?.addEventListener('change', e => {
      state.viewerSettings.labelMode = e.target.value;
      emit('viewer-settings-changed', { key: 'labelMode', value: e.target.value });
  });

  container.querySelector('#btn-display-all')?.addEventListener('click', () => {
      // Equivalent to escape
      if (_renderer && _renderer._clearSelection) {
          _renderer._clearSelection();
          _renderer.resetView();
      }
  });
}

function _syncLabelQuickControls(container) {
  const labelsCb = container.querySelector('#tog-labels-quick');
  if (labelsCb) labelsCb.checked = state.viewerSettings.showLabels !== false;

  const supportCb = container.querySelector('#tog-support-labels-quick');
  if (supportCb) supportCb.checked = !!state.viewerSettings.showRestraintNames;

  const labelMode = container.querySelector('#label-mode-quick');
  if (labelMode) labelMode.value = state.viewerSettings.labelMode || 'smart-density';
}

function _setStatus(container, msg) {
  const el = container.querySelector('#geo-status-text');
  if (el) el.textContent = msg;

  const d = new Date();
  const dateStr = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear().toString().substr(-2)}`;
  const timeStr = `${d.getHours().toString().padStart(2, '0')}.${d.getMinutes().toString().padStart(2, '0')}`;
  const vEl = container.querySelector('#geo-version-text');
  if (vEl) vEl.textContent = `ver.${dateStr} ${timeStr}`;
}

function _getGeometryData() {
  return state.geometryDirectData || state.parsed;
}

function _buildDirectGeometryData(text, fileName) {
  const parsedPcf = parsePcfText(text, null);
  const model = normalizePcfModel(parsedPcf, null);
  const nodes = {};
  const nodeIds = new Map();
  let nextNodeId = 1;

  const ensureNodeId = (point) => {
      if (!point) return null;
      const key = `${Number(point.x || 0)}|${Number(point.y || 0)}|${Number(point.z || 0)}`;
      if (!nodeIds.has(key)) {
          nodeIds.set(key, nextNodeId);
          nodes[nextNodeId] = { x: Number(point.x || 0), y: Number(point.y || 0), z: Number(point.z || 0) };
          nextNodeId += 1;
      }
      return nodeIds.get(key);
  };

  const elements = model.components.map((comp) => {
      const p1 = _toPoint(comp.ep1);
      const p2 = _toPoint(comp.ep2);
      const from = ensureNodeId(p1);
      const to = ensureNodeId(p2);
      const raw = comp.raw || {};
      return {
          from,
          to,
          lineNo: raw['COMPONENT-IDENTIFIER'] || comp.id,
          dx: p1 && p2 ? Number(p2.x - p1.x) : 0,
          dy: p1 && p2 ? Number(p2.y - p1.y) : 0,
          dz: p1 && p2 ? Number(p2.z - p1.z) : 0,
          od: Number(comp.bore || p1?.bore || p2?.bore || 0),
          wall: 0,
          fromPos: p1,
          toPos: p2,
          T1: null,
          P1: null,
          P2: null,
          material: raw['PIPING-SPEC'] || '',
          isBend: String(comp.type || '').toUpperCase() === 'BEND' || String(comp.type || '').toUpperCase() === 'ELBOW',
          isGhost: false,
          controlNode: ensureNodeId(_parsePoint(raw['CENTRE-POINT'])),
          support: String(comp.type || '').toUpperCase() === 'SUPPORT'
              ? { type: raw['SUPPORT-DIRECTION'] || raw['COMPONENT-IDENTIFIER'] || 'SUPPORT' }
              : null
      };
  }).filter((element) => element.fromPos && element.toPos);

  // Collect MESSAGE-CIRCLE blocks as node labels (from PCF, not synthesised)
  const messageCircleNodes = model.components
      .filter(c => c.type === 'MESSAGE-CIRCLE' && c.circleCoord && c.circleText)
      .map(c => ({ pos: c.circleCoord, text: c.circleText }));

  // Collect MESSAGE-SQUARE annotation labels (position assigned from next component)
  const messageSquareNodes = model.components
      .filter(c => c.type === 'MESSAGE-SQUARE' && c.squarePos && c.squareText)
      .map(c => ({ pos: c.squarePos, text: c.squareText }));

  return {
      fileName,
      format: 'PCF',
      elements,
      nodes,
      messageCircleNodes,
      messageSquareNodes,
      restraints: [],
      forces: [],
      rigids: [],
      units: {},
      meta: {},
  };
}

function _toPoint(point) {
  if (!point) return null;
  return {
      x: Number(point.x || 0),
      y: Number(point.y || 0),
      z: Number(point.z || 0),
      bore: Number(point.bore || 0),
  };
}

function _parsePoint(value) {
  if (!value) return null;
  const parts = String(value).trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return {
      x: Number(parts[0] || 0),
      y: Number(parts[1] || 0),
      z: Number(parts[2] || 0),
      bore: Number(parts[3] || 0),
  };
}
