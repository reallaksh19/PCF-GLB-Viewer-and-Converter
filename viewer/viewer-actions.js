/**
 * viewer-actions.js - Canonical action registry for 3D Viewer toolbar and shortcuts.
 */

export const ACTIONS = {
  NAV_SELECT: 'NAV_SELECT',
  NAV_ORBIT: 'NAV_ORBIT',
  MEASURE_TOOL: 'MEASURE_TOOL',
  NAV_PLAN_X: 'NAV_PLAN_X',
  NAV_ROTATE_Y: 'NAV_ROTATE_Y',
  NAV_ROTATE_Z: 'NAV_ROTATE_Z',
  NAV_PAN: 'NAV_PAN',
  VIEW_FIT_ALL: 'VIEW_FIT_ALL',
  VIEW_FIT_SELECTION: 'VIEW_FIT_SELECTION',
  VIEW_TOGGLE_PROJECTION: 'VIEW_TOGGLE_PROJECTION',
  SNAP_ISO_NW: 'SNAP_ISO_NW',
  SNAP_ISO_NE: 'SNAP_ISO_NE',
  SNAP_ISO_SW: 'SNAP_ISO_SW',
  SNAP_ISO_SE: 'SNAP_ISO_SE',
  SECTION_BOX: 'SECTION_BOX',
  SECTION_PLANE_UP: 'SECTION_PLANE_UP',
  SECTION_DISABLE: 'SECTION_DISABLE',
};

export function executeViewerAction(viewer, actionId) {
  if (!viewer || !actionId) return;

  switch (actionId) {
    case ACTIONS.NAV_SELECT:
      viewer.setNavMode?.('select');
      break;
    case ACTIONS.NAV_ORBIT:
      viewer.setNavMode?.('orbit');
      break;
    case ACTIONS.MEASURE_TOOL:
      viewer.setNavMode?.('measure');
      break;
    case ACTIONS.NAV_PLAN_X:
      viewer.setNavMode?.('plan');
      break;
    case ACTIONS.NAV_ROTATE_Y:
      viewer.setNavMode?.('rotateY');
      break;
    case ACTIONS.NAV_ROTATE_Z:
      viewer.setNavMode?.('rotateZ');
      break;
    case ACTIONS.NAV_PAN:
      viewer.setNavMode?.('pan');
      break;
    case ACTIONS.VIEW_FIT_ALL:
      viewer.fitAll?.();
      break;
    case ACTIONS.VIEW_FIT_SELECTION:
      viewer.fitSelection?.();
      break;
    case ACTIONS.VIEW_TOGGLE_PROJECTION:
      viewer.toggleProjection?.();
      break;
    case ACTIONS.SNAP_ISO_NW:
      viewer.snapToPreset?.('isoNW');
      break;
    case ACTIONS.SNAP_ISO_NE:
      viewer.snapToPreset?.('isoNE');
      break;
    case ACTIONS.SNAP_ISO_SW:
      viewer.snapToPreset?.('isoSW');
      break;
    case ACTIONS.SNAP_ISO_SE:
      viewer.snapToPreset?.('isoSE');
      break;
    case ACTIONS.SECTION_BOX:
      viewer.setSectionMode?.('BOX');
      break;
    case ACTIONS.SECTION_PLANE_UP:
      viewer.setSectionMode?.('PLANE_UP');
      break;
    case ACTIONS.SECTION_DISABLE:
      viewer.disableSection?.();
      break;
    default:
      break;
  }
}

export function resolveActionOrder(config) {
  const order = Array.isArray(config?.toolbar?.order) ? config.toolbar.order : [];
  const visible = new Set(Array.isArray(config?.toolbar?.visibleActions) ? config.toolbar.visibleActions : []);
  const actions = [];
  for (const id of order) {
    const enabled = config?.actions?.[id]?.enabled !== false;
    if (visible.has(id) && enabled) actions.push(id);
  }
  return actions;
}
