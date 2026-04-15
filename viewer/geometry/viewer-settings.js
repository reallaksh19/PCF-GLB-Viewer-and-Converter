/**
 * viewer-settings.js — Settings drawer for 3D Viewer.
 */

import { state, saveStickyState } from '../core/state.js';
import { emit } from '../core/event-bus.js';

export function renderSettingsPanel(container) {
    container.innerHTML = `
        <div class="settings-drawer">
            <div class="settings-header">
                <h3>Viewer Settings</h3>
                <button class="btn-small" id="btn-close-settings">×</button>
            </div>
            <div class="settings-body">
                <div class="settings-group">
                    <h4>Camera & Navigation</h4>
                    <label>
                        <span>Projection</span>
                        <select id="set-projection">
                            <option value="perspective" ${state.viewerSettings.projection === 'perspective' ? 'selected' : ''}>Perspective</option>
                            <option value="orthographic" ${state.viewerSettings.projection === 'orthographic' ? 'selected' : ''}>Orthographic</option>
                        </select>
                    </label>
                    <label>
                        <span>Auto Near/Far</span>
                        <input type="checkbox" id="set-auto-near-far" ${state.viewerSettings.autoNearFar ? 'checked' : ''}>
                    </label>
                    <label>
                        <span>Invert X</span>
                        <input type="checkbox" id="set-invert-x" ${state.viewerSettings.invertX ? 'checked' : ''}>
                    </label>
                    <label>
                        <span>Invert Y</span>
                        <input type="checkbox" id="set-invert-y" ${state.viewerSettings.invertY ? 'checked' : ''}>
                    </label>
                </div>

                <div class="settings-group">
                    <h4>Axis</h4>
                    <label>
                        <span>Convention</span>
                        <select id="set-axis-convention">
                            <option value="Z-up" ${state.viewerSettings.axisConvention === 'Z-up' ? 'selected' : ''}>Z-up (CAESAR/AutoCAD)</option>
                            <option value="Y-up" ${state.viewerSettings.axisConvention === 'Y-up' ? 'selected' : ''}>Y-up (Native Three.js)</option>
                        </select>
                    </label>
                    <label>
                        <span>Show Axis Gizmo</span>
                        <input type="checkbox" id="set-show-gizmo" ${state.viewerSettings.showAxisGizmo ? 'checked' : ''}>
                    </label>
                </div>

                <div class="settings-group">
                    <h4>Appearance</h4>
                    <label>
                        <span>Theme</span>
                        <select id="set-theme-preset">
                            <option value="NavisDark" ${state.viewerSettings.themePreset === 'NavisDark' ? 'selected' : ''}>Navis Dark (Non-drawing)</option>
                            <option value="DrawLight" ${state.viewerSettings.themePreset === 'DrawLight' ? 'selected' : ''}>Drawing Light</option>
                            <option value="DrawDark" ${state.viewerSettings.themePreset === 'DrawDark' ? 'selected' : ''}>Drawing Dark</option>
                        </select>
                    </label>
                </div>

                <div class="settings-group">
                    <button class="btn-secondary" style="width:100%" id="btn-reset-settings">Reset to Defaults</button>
                </div>
            </div>
        </div>
    `;

    _bindEvents(container);
}

function _bindEvents(container) {
    const bindSelect = (id, key) => {
        const el = container.querySelector(id);
        if (el) el.addEventListener('change', (e) => {
            state.viewerSettings[key] = e.target.value;
            saveStickyState();
            emit('viewer-settings-changed', { key, value: e.target.value });
        });
    };

    const bindCheckbox = (id, key) => {
        const el = container.querySelector(id);
        if (el) el.addEventListener('change', (e) => {
            state.viewerSettings[key] = e.target.checked;
            saveStickyState();
            emit('viewer-settings-changed', { key, value: e.target.checked });
        });
    };

    bindSelect('#set-projection', 'projection');
    bindCheckbox('#set-auto-near-far', 'autoNearFar');
    bindCheckbox('#set-invert-x', 'invertX');
    bindCheckbox('#set-invert-y', 'invertY');

    bindSelect('#set-axis-convention', 'axisConvention');
    bindCheckbox('#set-show-gizmo', 'showAxisGizmo');

    bindSelect('#set-theme-preset', 'themePreset');

    container.querySelector('#btn-close-settings')?.addEventListener('click', () => {
        container.style.display = 'none';
        emit('settings-drawer-closed');
    });

    container.querySelector('#btn-reset-settings')?.addEventListener('click', () => {
        // Simple reset logic
        state.viewerSettings.projection = 'perspective';
        state.viewerSettings.axisConvention = 'Z-up';
        state.viewerSettings.showLabels = true;
        state.viewerSettings.showRestraintNames = false;
        state.viewerSettings.labelMode = 'smart-density';
        state.viewerSettings.themePreset = 'NavisDark';
        state.viewerSettings.showAxisGizmo = true;
        state.viewerSettings.backgroundColor = null;
        saveStickyState();
        emit('viewer-settings-changed', { key: 'reset', value: true });
        renderSettingsPanel(container); // Re-render to update UI
    });
}
