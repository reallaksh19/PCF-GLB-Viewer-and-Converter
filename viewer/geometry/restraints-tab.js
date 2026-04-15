/**
 * restraints-tab.js — Manages the Restraints search interface in the side panel.
 */

import { state } from '../core/state.js';
import { classifySupport } from './symbols.js';
import { emit } from '../core/event-bus.js';

export function renderRestraintsPanel(element) {
    const panel = document.getElementById('panel-rests');
    if (!panel) return;

    if (!state.parsed || !state.parsed.restraints) {
        panel.innerHTML = `<div class="panel-placeholder">No restraints loaded</div>`;
        return;
    }

    panel.innerHTML = `
        <div class="restraint-search">
            <input type="text" id="restraint-search-input" placeholder="Search supports...">
            <button class="btn-small" id="restraint-search-clear">×</button>
        </div>
        <div class="restraint-filters" style="display:flex; gap: 8px; margin-bottom: 8px;">
            <select id="restraint-filter-type" style="flex:1;">
                <option value="all">All Types</option>
                <option value="GUIDE">Guide</option>
                <option value="ANCHOR">Anchor</option>
                <option value="STOP">Stop</option>
                <option value="SPRING">Spring</option>
                <option value="RIGID">Rigid</option>
                <option value="UNKNOWN">Unknown</option>
            </select>
        </div>
        <div id="restraint-results" style="overflow-y:auto; flex:1;"></div>
    `;

    _bindEvents(panel);
    _renderResults(panel, '');
}

function _bindEvents(panel) {
    const searchInput = panel.querySelector('#restraint-search-input');
    const clearBtn = panel.querySelector('#restraint-search-clear');
    const typeFilter = panel.querySelector('#restraint-filter-type');

    const update = () => _renderResults(panel, searchInput.value, typeFilter.value);

    searchInput.addEventListener('input', update);
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        update();
    });
    typeFilter.addEventListener('change', update);
}

function _renderResults(panel, query, typeFilter = 'all') {
    const resultsContainer = panel.querySelector('#restraint-results');
    if (!resultsContainer) return;

    const themeKey = state.viewerSettings.themePreset || 'NavisDark';
    const isDark = themeKey !== 'DrawLight';
    const cardBg = isDark ? '#111827' : '#fafbfc';
    const cardBorder = isDark ? '#243044' : 'var(--color-border)';
    const cardText = isDark ? '#dbe6f2' : 'var(--color-primary-dark)';
    const mutedText = isDark ? '#9fb2c8' : '#666';
    const typeBg = isDark ? '#1b2635' : '#e1e4e8';
    const typeText = isDark ? '#dbe6f2' : '#333';

    const queryUpper = query.toUpperCase();
    const allRestraints = state.parsed.restraints || [];

    const filtered = allRestraints.filter(r => {
        const name = r.name || r.type || '';
        const keywords = r.keywords || '';
        const type = classifySupport(r);

        if (typeFilter !== 'all' && type !== typeFilter) return false;

        if (query) {
            const matchStr = `${name} ${r.node} ${keywords} ${type}`.toUpperCase();
            if (!matchStr.includes(queryUpper)) return false;
        }

        return true;
    });

    if (filtered.length === 0) {
        resultsContainer.innerHTML = `<div class="panel-placeholder">No matching restraints found</div>`;
        return;
    }

    resultsContainer.innerHTML = `
        <div style="font-size: 11px; color: ${mutedText}; margin-bottom: 8px;">
            Found ${filtered.length} restraints
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            ${filtered.map(r => {
                const type = classifySupport(r);
                return `
                <div class="restraint-card" style="border:1px solid ${cardBorder}; border-radius:4px; padding:8px; background:${cardBg}; font-size:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <strong style="color:${cardText};">${r.name || r.type || 'Unnamed'}</strong>
                        <span style="font-size:10px; background:${typeBg}; color:${typeText}; padding:2px 4px; border-radius:2px;">${type}</span>
                    </div>
                    <div style="color:${mutedText}; margin-bottom:6px;">Node: ${r.node}</div>
                    <div style="text-align:right;">
                        <button class="btn-small btn-navigate" data-node="${r.node}">[→] Navigate</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    `;

    resultsContainer.querySelectorAll('.btn-navigate').forEach(btn => {
        btn.addEventListener('click', (e) => {
            emit('navigate-to-node', parseInt(e.target.dataset.node, 10));
        });
    });
}
