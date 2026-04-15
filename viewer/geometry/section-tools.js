/**
 * section-tools.js — 6-plane section box with draggable handles and stencil caps.
 */

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { state } from '../core/state.js';

export class SectionBox {
    constructor(scene, camera, renderer, domElement, controls) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.domElement = domElement;
        this.controls = controls;

        this.enabled = false;

        // 6 Planes: +X, -X, +Y, -Y, +Z, -Z
        this.planes = [
            new THREE.Plane(new THREE.Vector3(-1,  0,  0), 10000), // +X (Right)
            new THREE.Plane(new THREE.Vector3( 1,  0,  0), 10000), // -X (Left)
            new THREE.Plane(new THREE.Vector3( 0, -1,  0), 10000), // +Y (Top)
            new THREE.Plane(new THREE.Vector3( 0,  1,  0), 10000), // -Y (Bottom)
            new THREE.Plane(new THREE.Vector3( 0,  0, -1), 10000), // +Z (Front)
            new THREE.Plane(new THREE.Vector3( 0,  0,  1), 10000)  // -Z (Back)
        ];

        this.boxGroup = new THREE.Group();
        this.scene.add(this.boxGroup);

        // Visual Box Helper
        this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        const edges = new THREE.EdgesGeometry(this.boxGeometry);
        this.boxMaterial = new THREE.LineBasicMaterial({ color: 0x2E75B6, transparent: true, opacity: 0.5 });
        this.boxMesh = new THREE.LineSegments(edges, this.boxMaterial);
        this.boxGroup.add(this.boxMesh);

        // Transform Controls for dragging
        this.transformControls = new TransformControls(this.camera, this.domElement);
        this.transformControls.addEventListener('dragging-changed', (event) => {
            if (this.controls) this.controls.enabled = !event.value;
        });
        this.transformControls.addEventListener('change', () => this.updatePlanesFromBox());
        this.transformControls.setSpace('local');
        this.transformControls.showRotation = false;
        this.transformControls.showScale = true; // We scale to resize the box

        // In three.js r160, TransformControls extends Object3D directly and is added to the scene
        this.scene.add(this.transformControls);

        this.transformControls.attach(this.boxMesh);

        // Stencil caps material setup is done on the main materials by IsometricRenderer

        this.hide();
    }

    updateCamera(newCamera) {
        this.camera = newCamera;
        if (this.transformControls) {
            this.transformControls.camera = newCamera;
            this.transformControls.updateMatrixWorld();
        }
    }

    enable(boundingBox) {
        this.enabled = true;
        this.renderer.localClippingEnabled = true;

        if (boundingBox && !boundingBox.isEmpty()) {
            const center = boundingBox.getCenter(new THREE.Vector3());
            const size = boundingBox.getSize(new THREE.Vector3());

            // Add 5% padding
            size.multiplyScalar(1.05);

            this.boxMesh.position.copy(center);
            this.boxMesh.scale.copy(size);
        }

        this.updatePlanesFromBox();
        this.show();
    }

    disable() {
        this.enabled = false;
        this.renderer.localClippingEnabled = false;
        this.hide();
    }

    show() {
        this.boxGroup.visible = true;
        this.transformControls.enabled = true;
        this.transformControls.visible = true;
    }

    hide() {
        this.boxGroup.visible = false;
        this.transformControls.enabled = false;
        this.transformControls.visible = false;
    }

    updatePlanesFromBox() {
        if (!this.enabled) return;

        this.boxMesh.updateMatrixWorld();

        // Compute half sizes in local space
        const hx = this.boxMesh.scale.x / 2;
        const hy = this.boxMesh.scale.y / 2;
        const hz = this.boxMesh.scale.z / 2;

        // 6 normals in local space, mapped to world
        const m = this.boxMesh.matrixWorld;
        const e = m.elements;

        // World axes from matrix
        const ax = new THREE.Vector3(e[0], e[1], e[2]).normalize();
        const ay = new THREE.Vector3(e[4], e[5], e[6]).normalize();
        const az = new THREE.Vector3(e[8], e[9], e[10]).normalize();

        const pos = new THREE.Vector3();
        pos.setFromMatrixPosition(m);

        // +X plane (normal is -ax)
        this.planes[0].normal.copy(ax).negate();
        this.planes[0].constant = pos.clone().add(ax.clone().multiplyScalar(hx)).dot(ax);

        // -X plane (normal is ax)
        this.planes[1].normal.copy(ax);
        this.planes[1].constant = -pos.clone().sub(ax.clone().multiplyScalar(hx)).dot(ax);

        // +Y plane (normal is -ay)
        this.planes[2].normal.copy(ay).negate();
        this.planes[2].constant = pos.clone().add(ay.clone().multiplyScalar(hy)).dot(ay);

        // -Y plane (normal is ay)
        this.planes[3].normal.copy(ay);
        this.planes[3].constant = -pos.clone().sub(ay.clone().multiplyScalar(hy)).dot(ay);

        // +Z plane (normal is -az)
        this.planes[4].normal.copy(az).negate();
        this.planes[4].constant = pos.clone().add(az.clone().multiplyScalar(hz)).dot(az);

        // -Z plane (normal is az)
        this.planes[5].normal.copy(az);
        this.planes[5].constant = -pos.clone().sub(az.clone().multiplyScalar(hz)).dot(az);
    }

    getPlanes() {
        return this.enabled ? this.planes : [];
    }
}
