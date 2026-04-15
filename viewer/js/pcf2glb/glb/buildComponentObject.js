import * as THREE from 'three';
import { buildPipeMesh } from './buildPipeMesh.js';

export function buildReducerMesh(comp) {
  // Simplified reducer proxy
  if (!comp.ep1 || !comp.ep2) throw new Error(`Invalid reducer geometry for ${comp.id}`);

  const p1 = new THREE.Vector3(comp.ep1.x, comp.ep1.y, comp.ep1.z);
  const p2 = new THREE.Vector3(comp.ep2.x, comp.ep2.y, comp.ep2.z);
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const length = dir.length();

  const r1 = Math.max((comp.ep1.bore || 10) / 2, 0.5);
  const r2 = Math.max((comp.ep2.bore || 10) / 2, 0.5);

  const geom = new THREE.CylinderGeometry(r2, r1, length, 16);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5555aa });
  const mesh = new THREE.Mesh(geom, mat);

  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  mesh.position.copy(mid);

  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );

  mesh.name = comp.id;
  mesh.userData = { pcfType: comp.type, pcfId: comp.id, bore: comp.bore || null, refNo: comp.refNo || '', ...(comp.attributes || {}) };
  return mesh;
}

export function buildGenericProxy(comp, color=0xcc5555) {
  // Very simplified generic proxy (Box) at ep1 or center
  let pt = comp.ep1 ? new THREE.Vector3(comp.ep1.x, comp.ep1.y, comp.ep1.z) : new THREE.Vector3();
  const radius = Math.max((comp.bore || 20) / 2, 5);

  const geom = new THREE.BoxGeometry(radius * 3, radius * 3, radius * 3);
  const mat = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);

  mesh.position.copy(pt);
  mesh.name = comp.id;
  mesh.userData = { pcfType: comp.type, pcfId: comp.id, bore: comp.bore || null, refNo: comp.refNo || '', ...(comp.attributes || {}) };
  return mesh;
}

export function buildSupportProxy(comp) {
  let pt = comp.ep1 ? new THREE.Vector3(comp.ep1.x, comp.ep1.y, comp.ep1.z) : new THREE.Vector3();
  const radius = Math.max((comp.bore || 20) / 2, 5);
  const group = new THREE.Group();
  group.position.copy(pt);

  const attrs = comp.attributes || {};
  const sTag = String(attrs.SUPPORT_TAG || '').toUpperCase();
  const sName = String(attrs.SUPPORT_NAME || '').toUpperCase();
  const isGuide = sName === 'CA100' || sTag.includes('GUID') || sTag.includes('GDE');
  // Assume Rest by default if not guide, or explicitly CA150/REST

  const supportColor = 0x00ff00; // Green arrows

  // Upward Arrow (Rest) - placed below the pipe pointing up
  const rHeight = radius * 3;
  const arrowGeo = new THREE.CylinderGeometry(0, radius, rHeight, 16);
  const arrowMat = new THREE.MeshStandardMaterial({ color: supportColor });
  const upArrow = new THREE.Mesh(arrowGeo, arrowMat);
  // Position below pipe, pointing up (default cylinder points up along Y)
  upArrow.position.set(0, -radius - (rHeight/2), 0);
  group.add(upArrow);

  if (isGuide) {
      // Add lateral arrows pointing towards the pipe (along X and -X for instance)
      const latArrow1 = new THREE.Mesh(arrowGeo, arrowMat);
      latArrow1.rotation.z = -Math.PI / 2; // Point right (+X)
      latArrow1.position.set(-radius - (rHeight/2), 0, 0); // Placed on left

      const latArrow2 = new THREE.Mesh(arrowGeo, arrowMat);
      latArrow2.rotation.z = Math.PI / 2; // Point left (-X)
      latArrow2.position.set(radius + (rHeight/2), 0, 0); // Placed on right

      group.add(latArrow1);
      group.add(latArrow2);
  }

  group.name = comp.id;
  group.userData = { pcfType: comp.type, pcfId: comp.id, bore: comp.bore || null, refNo: comp.refNo || '', ...attrs };

  // For raycasting to hit the group, we attach userData to its children
  group.children.forEach(child => {
      child.userData = group.userData;
  });

  return group;
}

export function buildComponentObject(comp, log) {
  switch (comp.type) {
    case 'PIPE':
      return buildPipeMesh(comp);
    case 'REDUCER':
    case 'REDUCER-CONCENTRIC':
    case 'REDUCER-ECCENTRIC':
      return buildReducerMesh(comp);
    case 'BEND':
    case 'ELBOW':
      return buildGenericProxy(comp, 0xaa55aa);
    case 'TEE':
    case 'OLET':
      return buildGenericProxy(comp, 0x55aa55);
    case 'VALVE':
      return buildGenericProxy(comp, 0xcc2222);
    case 'FLANGE':
      return buildGenericProxy(comp, 0x888888);
    case 'SUPPORT':
      return buildSupportProxy(comp);
    default:
      if (log) log.warn('UNSUPPORTED_COMPONENT_TYPE', { id: comp.id, type: comp.type });
      return null;
  }
}
