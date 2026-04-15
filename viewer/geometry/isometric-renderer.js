/**
 * isometric-renderer.js - Three.js paper-isometric scene for CAESAR II geometry.
 * White background, bold line pipes, engineering symbols - looks like a paper iso drawing.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createPipeLine, createBendArc, createSolidCylinder, createSolidBend, colorForMode, OD_COLORS, toThree, generateDiscreteColor, SCALE } from './pipe-geometry.js';
import { createForceArrow } from './symbols.js';
import { createNodeLabel, createSegmentLabel, computeStretches, createMessageCircleLabel, createMessageSquareLabel } from './labels.js';
import { materialFromDensity } from '../utils/formatter.js';
import { state } from '../core/state.js';
import { on } from '../core/event-bus.js';
import { buildUniversalCSV, normalizeToPCF, adaptForRenderer } from '../utils/accdb-to-pcf.js';
import { SectionBox } from './section-tools.js';
import { renderPropertyPanel, showViewportChip, hideViewportChip } from './property-panel.js';
import { createSupportSymbol, resolveSupportRenderType } from './symbols.js';
import { renderRestraintsPanel } from './restraints-tab.js';
import { createSupportLabel } from './labels.js';

export class IsometricRenderer {
  constructor(canvasContainer) {
    this._container = canvasContainer;
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._css2d = null;
    this._controls = null;
    this._animId = null;
    this._pipeGroup   = new THREE.Group();
    this._symbolGroup = new THREE.Group();
    this._labelGroup  = new THREE.Group();
    this._supportLabelGroup = new THREE.Group();
    this._supportLabelGroup.visible = !!state.viewerSettings.showRestraintNames;
    this._msgCircleGroup = new THREE.Group(); // MESSAGE-CIRCLE node labels — always visible
    this._msgSquareGroup = new THREE.Group(); // MESSAGE-SQUARE annotation labels — always visible

    // First-person fly controls state
    this._flyState = {
        active: false,
        keys: { w: false, a: false, s: false, d: false, q: false, e: false, shift: false },
        velocity: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        speed: 100,
        lookSensitivity: 0.002,
        euler: new THREE.Euler(0, 0, 0, 'YXZ')
    };

    this._init();

    on('parse-complete', () => this.rebuild());
    on('geo-toggle',     () => this._applyToggles());
    on('legend-changed', () => this._rebuildAll());
    on('viewer-settings-changed', (e) => this._applySettings(e));
  }

  _init() {
    const w = this._container.clientWidth  || 800;
    const h = this._container.clientHeight || 500;

    this._scene = new THREE.Scene();
    const initTheme = state.viewerSettings.themePreset || 'NavisDark';
    const initBg = initTheme === 'DrawLight'
      ? '#f7f8fb'
      : initTheme === 'DrawDark'
        ? '#0b1220'
        : '#0f172a';
    this._scene.background = new THREE.Color(state.viewerSettings.backgroundColor || initBg);

    const aspect = w / h;
    const frustum = 5000;

    this._isOrtho = state.viewerSettings.projection === 'orthographic';

    this._orthoCamera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      -100000, 1000000
    );
    this._perspCamera = new THREE.PerspectiveCamera(state.viewerSettings.fov || 60, aspect, 0.1, 1000000);
    this._camera = this._isOrtho ? this._orthoCamera : this._perspCamera;

    this._orthoCamera.up.set(0, 1, 0);
    this._perspCamera.up.set(0, 1, 0);
    this._camera.position.set(5000, 5000, 5000);
    this._camera.lookAt(0, 0, 0);

    this._viewCubeEl = null;
    this._viewCubeInner = null;
    this._orbitTargetEl = null;
    this._navMode = state.viewerSettings.cameraMode || 'orbit';

    this._renderer = new THREE.WebGLRenderer({
        antialias: state.viewerSettings.antialias ?? true,
        preserveDrawingBuffer: true
    });
    this._renderer.setSize(w, h);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._container.appendChild(this._renderer.domElement);

    this._css2d = new CSS2DRenderer();
    this._css2d.setSize(w, h);
    this._css2d.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    this._container.style.position = 'relative';
    this._container.appendChild(this._css2d.domElement);

    // Initial controls setup
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = state.viewerSettings.enableDamping ?? true;
    this._controls.dampingFactor = state.viewerSettings.dampingFactor || 0.08;
    this._controls.rotateSpeed = state.viewerSettings.rotateSpeed || 1.0;
    this._controls.panSpeed = state.viewerSettings.panSpeed || 1.0;
    this._controls.zoomSpeed = state.viewerSettings.zoomSpeed || 1.0;
    this._controls.zoomToCursor = state.viewerSettings.zoomToCursor !== false;
    this._controls.screenSpacePanning = true;

    if (state.viewerSettings.invertX) this._controls.rotateSpeed *= -1;
    if (state.viewerSettings.invertY) this._controls.rotateSpeed *= -1;

    // Use shared module
    import('./camera-utils.js').then(({ setupControls }) => {
        this._controls = setupControls(this._camera, this._renderer.domElement, () => this._pipeGroup);
        this._controls.enableDamping = state.viewerSettings.enableDamping ?? true;
        this._controls.dampingFactor = state.viewerSettings.dampingFactor || 0.08;
        this._controls.rotateSpeed = state.viewerSettings.rotateSpeed || 1.0;
        this._controls.panSpeed = state.viewerSettings.panSpeed || 1.0;
        this._controls.zoomSpeed = state.viewerSettings.zoomSpeed || 1.0;
        this._controls.zoomToCursor = state.viewerSettings.zoomToCursor !== false;
        this._controls.screenSpacePanning = true;
        if (state.viewerSettings.invertX) this._controls.rotateSpeed *= -1;
        if (state.viewerSettings.invertY) this._controls.rotateSpeed *= -1;
        this._controls.addEventListener('change', () => this._onCameraChange());

        // Ensure section box gets the updated controls
        if (this._sectionBox) this._sectionBox.controls = this._controls;
    });

    // Set up lights for 3D Theme
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(2000, 4000, 2000);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(-1000, 5000, -2000);

    this._lightsGroup = new THREE.Group();
    this._lightsGroup.add(ambientLight, pointLight, directionalLight);

    this._sceneRoot = new THREE.Group();
    this._sceneRoot.add(this._pipeGroup, this._symbolGroup, this._lightsGroup);
    this._scene.add(this._sceneRoot);

    // Labels must be added to the scene directly because CSS2DObject rotation is tied to its group hierarchy
    // and passing -90 rotation to parent causes billboard label clipping/rotation bugs natively.
    this._scene.add(this._labelGroup);
    this._scene.add(this._supportLabelGroup);
    this._scene.add(this._msgCircleGroup);
    this._scene.add(this._msgSquareGroup);

    const ro = new ResizeObserver(() => this._onResize());
    ro.observe(this._container);

    this._bindKeyboard();
    this._bindFlyControls();

    this._buildViewCube();
    this._buildAxisGizmo();
    this._buildOrbitTargetMarker();

    this._sectionBox = new SectionBox(this._scene, this._camera, this._renderer, this._renderer.domElement, this._controls);

    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._hoveredObject = null;
    this._selectedObject = null;

    this._bindInteractions();

    // Init state
    this.setNavMode(this._navMode);

    on('navigate-to-node', (nodeId) => this._navigateToNode(nodeId));

    this._clock = new THREE.Clock();
    this._animate();
  }

  _applySettings(e) {
      if (e.key === 'projection') {
          if ((e.value === 'orthographic' && !this._isOrtho) || (e.value === 'perspective' && this._isOrtho)) {
              this.toggleProjection();
          }
      } else if (e.key === 'axisConvention') {
          this._applyAxisConvention();
          this.resetView(); // Reset view to ensure up vector is cleanly applied to controls
      } else if (e.key === 'showAxisGizmo') {
          if (this._gizmoEl) this._gizmoEl.style.display = state.viewerSettings.showAxisGizmo ? 'block' : 'none';
      } else if (e.key === 'themePreset') {
          this._applyTheme();
      } else if (e.key === 'showLabels' || e.key === 'labelMode') {
          this._rebuildLabels();
          this._labelGroup.visible = !!state.viewerSettings.showLabels;
      } else if (e.key === 'showRestraintNames') {
          this._rebuildSupportLabels();
          this._supportLabelGroup.visible = !!state.viewerSettings.showRestraintNames;
      } else if (e.key === 'reset') {
          this._applySettings({key: 'projection', value: state.viewerSettings.projection});
          this._applySettings({key: 'axisConvention', value: state.viewerSettings.axisConvention});
          this._applySettings({key: 'themePreset', value: state.viewerSettings.themePreset});
          if (this._gizmoEl) this._gizmoEl.style.display = state.viewerSettings.showAxisGizmo ? 'block' : 'none';
          this._labelGroup.visible = !!state.viewerSettings.showLabels;
          this._rebuildSupportLabels();
          this._supportLabelGroup.visible = !!state.viewerSettings.showRestraintNames;
      }
  }

  _applyTheme(noRebuild = false) {
      const themeKey = state.viewerSettings.themePreset || 'NavisDark';
      const THEMES = {
          NavisDark: {
              bg: '#0f172a',
              pipeMode: 'navis-dark',
              isSolid: true,
              lights: true,
              grid: true,
              labelBg: false,
              pipeTone: 0xb8c4d2,
          },
          DrawLight: {
              bg: '#f7f8fb',
              pipeMode: 'drawing-light',
              isSolid: false,
              lights: false,
              grid: true,
              labelBg: true,
              pipeTone: 0x1f2937,
          },
          DrawDark: {
              bg: '#0b1220',
              pipeMode: 'drawing-dark',
              isSolid: false,
              lights: true,
              grid: true,
              labelBg: false,
              pipeTone: 0xcbd5e1,
          }
      };

      const theme = THEMES[themeKey] || THEMES.NavisDark;
      this._scene.background = new THREE.Color(state.viewerSettings.backgroundColor || theme.bg);
      if (this._renderer) {
          this._renderer.setClearColor(new THREE.Color(state.viewerSettings.backgroundColor || theme.bg), 1);
      }
      this._lightsGroup.visible = !!theme.lights;
      if (this._gridHelper) this._gridHelper.visible = state.viewerSettings.showGrid !== false && !!theme.grid;
      if (this._labelGroup) {
          const bg = theme.labelBg ? 'rgba(255,255,255,0.88)' : 'transparent';
          this._labelGroup.traverse?.(obj => {
              if (obj?.element) obj.element.style.background = bg;
          });
      }
      this._currentTheme = theme;

      if (!noRebuild) {
          // Fully rebuild if toggling between line art and solid 3D representation
          this.rebuild();
      }
  }

  _applyAxisConvention() {
      // Default: Z-up
      // Scene starts in Y-up naturally.
      // If Z-up: rotate sceneRoot -90 on X. Camera up = (0, 0, 1)
      // If Y-up: sceneRoot rot = 0. Camera up = (0, 1, 0)
      if (state.viewerSettings.axisConvention === 'Z-up') {
          this._sceneRoot.rotation.x = -Math.PI / 2;
          this._orthoCamera.up.set(0, 0, 1);
          this._perspCamera.up.set(0, 0, 1);
      } else {
          this._sceneRoot.rotation.x = 0;
          this._orthoCamera.up.set(0, 1, 0);
          this._perspCamera.up.set(0, 1, 0);
      }
      this._camera.updateProjectionMatrix();
      this._controls.update();
  }

  _onCameraChange() {
      if (state.viewerSettings.autoNearFar && this._pipeGroup.children.length > 0) {
          this.autoFitNearFar(this._camera, this._pipeGroup.children);
      }
  }

  autoFitNearFar(camera, visibleMeshes) {
      const sphere = new THREE.Sphere();
      const box = new THREE.Box3();
      visibleMeshes.forEach(m => {
          if (m.geometry) {
              if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
              const b = m.geometry.boundingBox.clone();
              b.applyMatrix4(m.matrixWorld);
              box.union(b);
          }
      });
      if (box.isEmpty()) return;

      box.getBoundingSphere(sphere);
      const dist = camera.position.distanceTo(sphere.center);

      if (camera.isPerspectiveCamera) {
          camera.near = Math.max(1e-4, (dist - sphere.radius) * 0.1);
          camera.far  = (dist + sphere.radius) * 10;
      } else {
          // Ortho
          camera.near = -sphere.radius * 2;
          camera.far = sphere.radius * 2;
      }
      camera.updateProjectionMatrix();
  }

  setNavMode(mode) {
    const normalizedMode = mode === '3d-orbit' ? 'orbit' : mode;
    this._navMode = normalizedMode;
    state.viewerSettings.cameraMode = normalizedMode;

    // Reset defaults
    if (this._customOrbitCleanup) {
      this._customOrbitCleanup();
      this._customOrbitCleanup = null;
    }
    this._controls.minPolarAngle   = 0;
    this._controls.maxPolarAngle   = Math.PI;
    this._controls.minAzimuthAngle = -Infinity;
    this._controls.maxAzimuthAngle =  Infinity;
    this._flyState.active = false;
    this._controls.enabled = true;

    switch (normalizedMode) {
      case 'orbit':
        this._controls.enableRotate = true;
        this._controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        break;
      case 'select':
        this._controls.enableRotate = false;
        this._controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        break;
      case 'pan':
        this._controls.enableRotate = false;
        this._controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        break;
      case 'rotateY':
      case 'rotateX':
      case 'rotateZ':
        this._startPlanarOrbit(mode);
        break;
      case 'plan':
        this._startPlanarOrbit('plan');
        break;
      case 'fly':
        this._controls.enabled = false;
        this._flyState.active = true;
        this._flyState.euler.setFromQuaternion(this._camera.quaternion);
        break;
    }
  }

  _startPlanarOrbit(mode) {
      const canvas = this._renderer.domElement;
      let isDown = false;
      let prevX = 0, prevY = 0;
      this._controls.enableRotate = false;

      // Planar modes logic.
      // Use OrbitControls directly but lock rotation using azimuth/polar clamping depending on the axis.
      // E.g. rotate about Y (world Y) = allow azimuth rotation, lock polar.
      // rotate about X = need custom math as orbit controls only orbits around Y (or configured up vector) natively.

      const axisProvider = () => this._getPlanarOrbitAxis(mode);

      const onDown = (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          isDown = true;
          prevX = e.clientX;
          prevY = e.clientY;
          canvas.setPointerCapture(e.pointerId);
      };

      const onMove = (e) => {
          if (!isDown) return;
          e.stopPropagation();
          const dx = e.clientX - prevX;
          const dy = e.clientY - prevY;
          prevX = e.clientX;
          prevY = e.clientY;

          let hAngle = -(dx) / canvas.clientWidth * Math.PI * 2.5 * this._controls.rotateSpeed;
          let vAngle = -(dy) / canvas.clientHeight * Math.PI * 2.5 * this._controls.rotateSpeed;

          if (mode === 'plan') {
              // PLAN mode: roll the camera around the current view direction,
              // so the screen plane spins like rotating a sheet of paper.
              const target = this._controls.target.clone();
              const forward = target.clone().sub(this._camera.position);
              if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
              forward.normalize();

              const roll = new THREE.Quaternion().setFromAxisAngle(forward, hAngle);
              this._camera.up.applyQuaternion(roll);
              this._camera.lookAt(target);
              this._camera.updateProjectionMatrix();
          } else {
              const offset = this._camera.position.clone().sub(this._controls.target);
              const axis = axisProvider();

              // Fixed-axis rotate mode.
              offset.applyAxisAngle(axis, hAngle);

              this._camera.position.copy(this._controls.target).add(offset);
              this._camera.lookAt(this._controls.target);
              this._camera.updateProjectionMatrix();
          }

          // Log rotation data
          import('../core/logger.js').then(({ addLog, SEVERITY, CATEGORY }) => {
              // Throttle logging to avoid spam
              if (Math.random() < 0.05) {
                 addLog({
                     severity: SEVERITY.INFO,
                     category: CATEGORY.NAVIGATION,
                     message: `Planar rotation applied about ${mode}: hAngle=${hAngle.toFixed(4)}`,
                 });
              }
          });
      };

      const onUp = (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          isDown = false;
          canvas.releasePointerCapture(e.pointerId);
      };

      canvas.addEventListener('pointerdown', onDown, { capture: true });
      canvas.addEventListener('pointermove', onMove, { capture: true });
      canvas.addEventListener('pointerup', onUp, { capture: true });

      this._customOrbitCleanup = () => {
          canvas.removeEventListener('pointerdown', onDown, { capture: true });
          canvas.removeEventListener('pointermove', onMove, { capture: true });
          canvas.removeEventListener('pointerup', onUp, { capture: true });
          this._controls.enableRotate = true;
      };
  }

  _getPlanarOrbitAxis(mode) {
      const basis = this._getViewBasis();

      // Treat the navigation axes as view-relative so they stay orthogonal to
      // the current screen even after switching away from orbit and back again.
      if (mode === 'plan' || mode === 'rotateX') return basis.forward;
      if (mode === 'rotateY') return basis.up;
      if (mode === 'rotateZ') return basis.right;

      return basis.forward;
  }

  _getViewBasis() {
      const target = this._controls?.target?.clone?.() || new THREE.Vector3();
      const forward = target.clone().sub(this._camera?.position || new THREE.Vector3());
      if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
      forward.normalize();

      const up = (this._camera?.up?.clone?.() || new THREE.Vector3(0, 1, 0)).normalize();
      let right = new THREE.Vector3().crossVectors(forward, up);
      if (right.lengthSq() < 1e-8) {
          right = new THREE.Vector3(1, 0, 0).cross(forward);
      }
      right.normalize();

      const correctedUp = new THREE.Vector3().crossVectors(right, forward).normalize();
      return { forward, right, up: correctedUp };
  }

  _bindFlyControls() {
      const canvas = this._renderer.domElement;

      const onKeyDown = (e) => {
          if (!this._flyState.active) return;
          switch(e.code) {
              case 'KeyW': this._flyState.keys.w = true; break;
              case 'KeyA': this._flyState.keys.a = true; break;
              case 'KeyS': this._flyState.keys.s = true; break;
              case 'KeyD': this._flyState.keys.d = true; break;
              case 'KeyE': this._flyState.keys.e = true; break;
              case 'KeyQ': this._flyState.keys.q = true; break;
              case 'ShiftLeft':
              case 'ShiftRight': this._flyState.keys.shift = true; break;
          }
      };

      const onKeyUp = (e) => {
          if (!this._flyState.active) return;
          switch(e.code) {
              case 'KeyW': this._flyState.keys.w = false; break;
              case 'KeyA': this._flyState.keys.a = false; break;
              case 'KeyS': this._flyState.keys.s = false; break;
              case 'KeyD': this._flyState.keys.d = false; break;
              case 'KeyE': this._flyState.keys.e = false; break;
              case 'KeyQ': this._flyState.keys.q = false; break;
              case 'ShiftLeft':
              case 'ShiftRight': this._flyState.keys.shift = false; break;
          }
      };

      let isLooking = false;
      const onPointerDown = (e) => {
          if (!this._flyState.active || e.button !== 0) return;
          isLooking = true;
          canvas.requestPointerLock();
      };

      const onPointerMove = (e) => {
          if (!this._flyState.active || !isLooking) return;
          if (document.pointerLockElement === canvas) {
              this._flyState.euler.y -= e.movementX * this._flyState.lookSensitivity;
              this._flyState.euler.x -= e.movementY * this._flyState.lookSensitivity;
              this._flyState.euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this._flyState.euler.x));
              this._camera.quaternion.setFromEuler(this._flyState.euler);
          }
      };

      const onPointerUp = () => { isLooking = false; document.exitPointerLock(); };
      const onWheel = (e) => {
          if (!this._flyState.active) return;
          this._flyState.speed += e.deltaY > 0 ? -10 : 10;
          this._flyState.speed = Math.max(10, Math.min(this._flyState.speed, 1000));
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('wheel', onWheel);
  }

  _bindKeyboard() {
      const sectionBtn = this._container.querySelector('#btn-section');
      if (sectionBtn) sectionBtn.addEventListener('click', () => this.toggleSectionBox());

      window.addEventListener('keydown', (e) => {
          // Ignore if user is typing in input
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

          if (e.code === 'KeyO') this._simulateNavClick('orbit');
          if (e.code === 'KeyS') this._simulateNavClick('select');
          if (e.code === 'KeyX') this._simulateNavClick('plan'); // X key maps to plan/rotateX
          if (e.code === 'KeyY') this._simulateNavClick('rotateY');
          if (e.code === 'KeyZ') this._simulateNavClick('rotateZ');
          if (e.code === 'KeyP') this._simulateNavClick('pan');
          if (e.code === 'KeyH') this.resetView();
          if (e.code === 'KeyF') this._frameSelection();
          if (e.code === 'KeyV') this.toggleProjection();
          if (e.code === 'KeyB') this._simulateNavClick('section');
          if (e.code === 'KeyI') this._isolateSelection();
          if (e.code === 'Escape') this._clearSelection();
          if (e.code === 'Digit3') this._setPivotToSelection();
          if (e.code === 'KeyR') this._resetPivot();
          if (e.code === 'F9')   this._simulateNavClick('fly');
          if (e.code === 'Numpad7') {
              if (e.ctrlKey) this._snapToPreset([0, -1, 0], [0, 0, 1]); // Bottom
              else this._snapToPreset([0, 1, 0], [0, 0, -1]); // Top
          }
          if (e.code === 'Numpad1') {
              if (e.ctrlKey) this._snapToPreset([0, 0, -1], [0, 1, 0]); // Back
              else this._snapToPreset([0, 0, 1], [0, 1, 0]); // Front
          }
          if (e.code === 'Numpad3') {
              if (e.ctrlKey) this._snapToPreset([-1, 0, 0], [0, 1, 0]); // Left
              else this._snapToPreset([1, 0, 0], [0, 1, 0]); // Right
          }
          if (e.code === 'Numpad0') {
              if (e.ctrlKey) this._snapToPreset([1, 1, -1], [0, 1, 0]); // ISO NE
              else this._snapToPreset([-1, 1, 1], [0, 1, 0]); // ISO NW
          }
      });
  }

  _simulateNavClick(mode) {
      if (mode === 'section') {
          this.toggleSectionBox();
          return;
      }
      const btn = this._container.querySelector(`.btn-icon[data-mode="${mode}"]`);
      if (btn) btn.click();
      else this.setNavMode(mode);
  }

  toggleSectionBox() {
      const btn = this._container.querySelector('#btn-section');
      if (this._sectionBox.enabled) {
          this._sectionBox.disable();
          if (btn) btn.classList.remove('active');
          state.viewerSettings.sectionEnabled = false;
      } else {
          const box = new THREE.Box3();
          if (this._pipeGroup) box.setFromObject(this._pipeGroup);
          this._sectionBox.enable(box);
          if (btn) btn.classList.add('active');
          state.viewerSettings.sectionEnabled = true;
      }

      this._applyClipping();
  }

  _bindInteractions() {
      const canvas = this._renderer.domElement;

      let hoverTimeout;
      canvas.addEventListener('pointermove', (e) => {
          this._updateMouseFromEvent(e);
          if (this._navMode !== 'select' && this._navMode !== 'orbit' && this._navMode !== 'plan') return;

          // Throttle hover
          if (hoverTimeout) return;
          hoverTimeout = setTimeout(() => {
              hoverTimeout = null;
              this._raycaster.setFromCamera(this._mouse, this._camera);
              const intersects = this._raycaster.intersectObjects(this._pipeGroup.children, true);

              if (intersects.length > 0) {
                  const object = intersects[0].object;
                  if (this._hoveredObject !== object) {
                      this._hoveredObject = object;
                      if (object.userData && object.userData.element) {
                          showViewportChip(object.userData.element, e.clientX, e.clientY);
                      } else {
                          hideViewportChip();
                      }
                  } else if (this._hoveredObject && this._hoveredObject.userData.element) {
                      // Update position
                      showViewportChip(this._hoveredObject.userData.element, e.clientX, e.clientY);
                  }
              } else {
                  this._hoveredObject = null;
                  hideViewportChip();
              }
          }, 50);
      });

      canvas.addEventListener('pointerleave', () => hideViewportChip());

      canvas.addEventListener('pointerdown', (e) => {
          this._updateMouseFromEvent(e);
          if ((this._navMode === 'orbit' || this._navMode === 'plan') && (e.altKey || e.shiftKey)) {
              this._focusOrbitTargetFromPointer(true);
          }
      }, { capture: true });

      canvas.addEventListener('wheel', (e) => {
          if (this._navMode !== 'orbit' && this._navMode !== 'plan') return;
          this._updateMouseFromEvent(e);
          this._focusOrbitTargetFromPointer(true);
      }, { capture: true, passive: true });

      canvas.addEventListener('click', (e) => {
          if (this._navMode !== 'select' && this._navMode !== 'orbit' && this._navMode !== 'plan') return;
          this._raycaster.setFromCamera(this._mouse, this._camera);
          const intersects = this._raycaster.intersectObjects(this._pipeGroup.children, true);

          if (intersects.length > 0) {
              const object = intersects[0].object;
              this._selectedObject = object;
              if (object.userData && object.userData.element) {
                  this._focusOrbitTarget(object);
                  renderPropertyPanel(object.userData.element);
              }
          } else {
              if (this._navMode === 'orbit' || this._navMode === 'plan') {
                  return;
              }
              if (this._selectedObject) {
                  import('../core/logger.js').then(({ addLog, SEVERITY, CATEGORY }) => {
                      addLog({
                          severity: SEVERITY.INFO,
                          category: CATEGORY.UI,
                          message: "Cleared selection via background click"
                      });
                  });
              } else {
                  import('../core/logger.js').then(({ addLog, SEVERITY, CATEGORY }) => {
                      addLog({
                          severity: SEVERITY.WARNING,
                          category: CATEGORY.UI,
                          message: "Selection failure: clicked background but no object intersected"
                      });
                  });
              }
              this._selectedObject = null;
              renderPropertyPanel(null);
          }
      });
  }

  _updateMouseFromEvent(e) {
      const canvas = this._renderer?.domElement;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  _focusOrbitTargetFromPointer(useHitPoint = false) {
      if (!this._camera || !this._raycaster || !this._pipeGroup) return false;
      this._raycaster.setFromCamera(this._mouse, this._camera);
      const intersects = this._raycaster.intersectObjects(this._pipeGroup.children, true);
      if (!intersects.length) return false;
      if (useHitPoint && intersects[0].point) {
          return this._focusOrbitTargetAtPoint(intersects[0].point);
      }
      this._focusOrbitTarget(intersects[0].object);
      return true;
  }

  _focusOrbitTargetFromView() {
      if (!this._camera || !this._raycaster || !this._pipeGroup) return false;
      this._mouse.set(0, 0);
      this._raycaster.setFromCamera(this._mouse, this._camera);
      const intersects = this._raycaster.intersectObjects(this._pipeGroup.children, true);
      if (!intersects.length) return false;
      this._focusOrbitTarget(intersects[0].object);
      return true;
  }

  _applyClipping() {
      const planes = this._sectionBox.getPlanes();

      // Apply clipping to all materials in pipeGroup and symbolGroup
      this._pipeGroup.traverse(child => {
          if (child.material) {
              child.material.clippingPlanes = planes;
              child.material.clipIntersection = state.viewerSettings.clipIntersection || false;
              child.material.needsUpdate = true;
          }
      });

      this._symbolGroup.traverse(child => {
          if (child.material) {
              child.material.clippingPlanes = planes;
              child.material.clipIntersection = state.viewerSettings.clipIntersection || false;
              child.material.needsUpdate = true;
          }
      });
  }

  _frameSelection() {
      if (!this._selectedObject) {
          this.resetView();
          return;
      }

      import('./camera-utils.js').then(({ fitCamera }) => {
          // fitCamera expects any Object3D. We can just pass the selected object directly
          // so it computes the Box3 correctly using world matrix (including sceneRoot rotations).
          fitCamera(this._camera, this._controls, this._selectedObject, this._container.clientWidth, this._container.clientHeight);
      });
  }

  resetView() {
      import('./camera-utils.js').then(({ fitCamera }) => {
          fitCamera(this._camera, this._controls, this._sceneRoot, this._container.clientWidth, this._container.clientHeight);
      });
  }

  _isolateSelection() {
      if (!this._selectedObject) return;

      this._pipeGroup.children.forEach(child => {
          if (child !== this._selectedObject) {
              child.visible = false;
          }
      });

      this._symbolGroup.children.forEach(child => {
          child.visible = false;
      });

      this._frameSelection();
  }

  _clearSelection() {
      this._selectedObject = null;
      renderPropertyPanel(null);

      this._pipeGroup.children.forEach(child => child.visible = true);
      this._symbolGroup.children.forEach(child => child.visible = true);

      // Update materials if we added emissive highlighting here
  }

  _setPivotToSelection() {
      this._focusOrbitTarget(this._selectedObject);
  }

  _focusOrbitTarget(object) {
      if (!object || !this._controls || !this._camera) return false;
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return false;

      const center = box.getCenter(new THREE.Vector3());
      const delta = center.clone().sub(this._controls.target);
      this._controls.target.add(delta);
      this._camera.position.add(delta);
      this._controls.update();
      return true;
  }

  _focusOrbitTargetAtPoint(point) {
      if (!point || !this._controls || !this._camera) return false;
      const delta = point.clone().sub(this._controls.target);
      this._controls.target.add(delta);
      this._camera.position.add(delta);
      this._controls.update();
      return true;
  }

  _resetPivot() {
      const box = new THREE.Box3().setFromObject(this._sceneRoot);
      if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          this._controls.target.copy(center);
          this._controls.update();
          return true;
      }
      return false;
  }

  _snapToPreset(dirVec, upVec) {
      const box = new THREE.Box3();
      if (this._pipeGroup) box.setFromObject(this._pipeGroup);
      const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
      const size = box.isEmpty() ? 5000 : Math.max(...box.getSize(new THREE.Vector3()).toArray());

      const dir = new THREE.Vector3(...dirVec).normalize();
      const pos = center.clone().add(dir.multiplyScalar(size * 1.5));

      this._camera.position.copy(pos);
      this._camera.up.set(...upVec);
      this._camera.lookAt(center);
      this._controls.target.copy(center);
      this._camera.updateProjectionMatrix();
      this._controls.update();

      import('../core/logger.js').then(({ addLog, SEVERITY, CATEGORY }) => {
          addLog({
              severity: SEVERITY.INFO,
              category: CATEGORY.NAVIGATION,
              message: `View change: snapped to preset dir [${dirVec.join(',')}]`,
          });
      });
  }
  _buildViewCube() {
      const existing = document.getElementById('pcf-view-cube');
      if (existing) existing.remove();

      const size = Number(state.viewerSettings.viewCubeSize) || 120;
      const opacity = state.viewerSettings.viewCubeOpacity ?? 0.85;
      const pos = state.viewerSettings.viewCubePosition || 'top-right';
      const positionStyles = {
          'top-left': 'top:12px;left:12px;',
          'top-right': 'top:12px;right:12px;',
          'bottom-left': 'bottom:12px;left:12px;',
          'bottom-right': 'bottom:12px;right:12px;',
      };
      const posStyles = positionStyles[pos] || positionStyles['top-right'];

      const cube = document.createElement('div');
      cube.id = 'pcf-view-cube';
      cube.style.cssText = `
          position:absolute;${posStyles}width:${size}px;height:${size}px;
          perspective:300px;cursor:pointer;user-select:none;z-index:10;
          opacity:${opacity};
          transition:opacity 0.2s;
      `;

      cube.addEventListener('mouseenter', () => {
          cube.style.opacity = '1';
      });
      cube.addEventListener('mouseleave', () => {
          cube.style.opacity = String(opacity);
      });

      const inner = document.createElement('div');
      inner.style.cssText = `
          width:100%;height:100%;position:relative;transform-style:preserve-3d;
          transition:transform 0.05s linear;
      `;

      const half = size / 2;
      const isZup = state.viewerSettings.axisConvention === 'Z-up';
      const FACES = isZup
          ? [
              { label: 'Top',    rot: 'rotateX(-90deg)',                       bg: '#2E75B6', cam: [0, 1, 0], up: [0, 0, -1] },
              { label: 'Bottom', rot: 'rotateX(90deg)',                        bg: '#1F4E79', cam: [0, -1, 0], up: [0, 0, 1] },
              { label: 'Front',  rot: `translateZ(${half}px)`,                 bg: '#41719C', cam: [0, 0, 1], up: [0, 1, 0] },
              { label: 'Back',   rot: `rotateY(180deg) translateZ(${half}px)`, bg: '#41719C', cam: [0, 0, -1], up: [0, 1, 0] },
              { label: 'Right',  rot: `rotateY(90deg) translateZ(${half}px)`,  bg: '#5B9BD5', cam: [1, 0, 0], up: [0, 1, 0] },
              { label: 'Left',   rot: `rotateY(-90deg) translateZ(${half}px)`, bg: '#5B9BD5', cam: [-1, 0, 0], up: [0, 1, 0] },
            ]
          : [
              { label: 'Top',    rot: 'rotateX(-90deg)',                       bg: '#2c7c45', cam: [0, 1, 0], up: [0, 0, -1] },
              { label: 'Bottom', rot: 'rotateX(90deg)',                        bg: '#1a4d2b', cam: [0, -1, 0], up: [0, 0, 1] },
              { label: 'Front',  rot: `translateZ(${half}px)`,                 bg: '#4a7c95', cam: [0, 0, 1], up: [0, 1, 0] },
              { label: 'Back',   rot: `rotateY(180deg) translateZ(${half}px)`, bg: '#4a7c95', cam: [0, 0, -1], up: [0, 1, 0] },
              { label: 'Right',  rot: `rotateY(90deg) translateZ(${half}px)`,  bg: '#3a6e85', cam: [1, 0, 0], up: [0, 1, 0] },
              { label: 'Left',   rot: `rotateY(-90deg) translateZ(${half}px)`, bg: '#3a6e85', cam: [-1, 0, 0], up: [0, 1, 0] },
            ];

      for (const faceSpec of FACES) {
          const face = document.createElement('div');
          face.textContent = faceSpec.label;
          face.style.cssText = `
              position:absolute;width:${size}px;height:${size}px;
              display:flex;align-items:center;justify-content:center;
              font-size:12px;font-weight:bold;color:#fff;background:${faceSpec.bg}cc;
              border:1px solid #ffffff55;box-sizing:border-box;
              transform:${faceSpec.rot};backface-visibility:visible;
          `;
          face.addEventListener('mouseenter', () => {
              face.style.background = `${faceSpec.bg}ff`;
          });
          face.addEventListener('mouseleave', () => {
              face.style.background = `${faceSpec.bg}cc`;
          });
          face.addEventListener('click', (e) => {
              e.stopPropagation();
              this._snapToPreset(faceSpec.cam, faceSpec.up);
          });
          inner.appendChild(face);
      }

      const cornerSpecs = [
          { id: 'iso-ne-top', label: 'NE', title: 'Isometric NE Top', style: 'top:-10px;right:-10px;', cam: [1, 1, -1], up: [0, 1, 0] },
          { id: 'iso-nw-top', label: 'NW', title: 'Isometric NW Top', style: 'top:-10px;left:-10px;', cam: [-1, 1, -1], up: [0, 1, 0] },
          { id: 'iso-se-bot', label: 'SE', title: 'Isometric SE Bottom', style: 'bottom:-10px;right:-10px;', cam: [1, -1, 1], up: [0, 1, 0] },
          { id: 'iso-sw-bot', label: 'SW', title: 'Isometric SW Bottom', style: 'bottom:-10px;left:-10px;', cam: [-1, -1, 1], up: [0, 1, 0] },
      ];
      for (const cp of cornerSpecs) {
          const corner = document.createElement('button');
          corner.type = 'button';
          corner.id = cp.id;
          corner.title = cp.title;
          corner.textContent = cp.label;
          corner.style.cssText = `
              position:absolute;${cp.style};width:28px;height:28px;
              border-radius:50%;border:1px solid #ffffff77;
              background:#101522dd;color:#fff;font-size:10px;font-weight:700;
              display:flex;align-items:center;justify-content:center;
              cursor:pointer;z-index:20;pointer-events:auto;box-shadow:0 2px 6px rgba(0,0,0,0.35);
          `;
          corner.addEventListener('mouseenter', () => {
              corner.style.background = '#20314ecc';
              corner.style.borderColor = '#ffffffcc';
          });
          corner.addEventListener('mouseleave', () => {
              corner.style.background = '#101522dd';
              corner.style.borderColor = '#ffffff77';
          });
          corner.addEventListener('click', (e) => {
              e.stopPropagation();
              this._snapToPreset(cp.cam, cp.up);
          });
          inner.appendChild(corner);
      }

      cube.appendChild(inner);
      this._viewCubeInner = inner;
      this._viewCubeEl = cube;
      this._container.appendChild(cube);

      if (state.viewerSettings.showViewCube === false) {
          cube.style.display = 'none';
      }
  }

  _syncViewCube() {
      if (!this._viewCubeInner || !this._camera || state.viewerSettings.showViewCube === false) return;

      const q = this._camera.quaternion.clone();
      if (state.viewerSettings.axisConvention === 'Z-up') {
          const rootQ = new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(1, 0, 0),
              -Math.PI / 2
          );
          q.premultiply(rootQ.clone().invert());
      }

      const mat = new THREE.Matrix4().makeRotationFromQuaternion(q.clone().invert());
      this._viewCubeInner.style.transform = `matrix3d(${mat.elements.join(',')})`;
  }

  _buildAxisGizmo() {
    const SZ = 120;
    let container = document.getElementById('pcf-axis-gizmo');
    if (container) {
      this._gizmoEl = container;
      const canvas = container.querySelector('canvas');
      if (canvas) this._axisGizmoCtx = canvas.getContext('2d');
      return;
    }
    container = document.createElement('div');
    container.id = 'pcf-axis-gizmo';
    container.style.cssText = `
      position:absolute;bottom:12px;right:12px;width:${SZ}px;height:${SZ}px;
      z-index:10;pointer-events:none;
    `;
    const canvas = document.createElement('canvas');
    canvas.width = SZ; canvas.height = SZ;
    container.appendChild(canvas);
    this._gizmoEl = container;
    this._container.appendChild(container);
    this._axisGizmoCtx = canvas.getContext('2d');
  }

  _syncAxisGizmo() {
    const ctx = this._axisGizmoCtx;
    if (!ctx || !this._camera) return;
    const W = 120, H = 120, cx = W / 2, cy = H / 2, len = 42;

    ctx.clearRect(0, 0, W, H);

    // Background circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 56, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,20,30,0.18)';
    ctx.fill();
    ctx.restore();

    // CAESAR axis labels mapped to Three.js directions:
    //   Three.js +X = CAESAR North (Y)  → green  → label "Y"
    //   Three.js +Y = CAESAR Up    (Z)  → blue   → label "Z"
    //   Three.js +Z = CAESAR East  (X)  → red    → label "X"
    const AXES = [
      { dir: new THREE.Vector3(1, 0, 0),  color: '#33cc33', neg: '#226622', label: 'Y' }, // CAESAR Y (North)
      { dir: new THREE.Vector3(0, 1, 0),  color: '#3388ff', neg: '#224488', label: 'Z' }, // CAESAR Z (Up)
      { dir: new THREE.Vector3(0, 0, 1),  color: '#ff3333', neg: '#882222', label: 'X' }, // CAESAR X (East)
    ];

    // Project all axes and sort back-to-front (draw behind first)
    const projected = AXES.map(({ dir, color, neg, label }) => {
      const proj = dir.clone().applyQuaternion(this._camera.quaternion);
      return { proj, color, neg, label, depth: proj.z };
    });
    projected.sort((a, b) => b.depth - a.depth); // highest z = most behind = draw first

    for (const { proj, color, neg, label } of projected) {
      const isFront = proj.z <= 0;  // z<=0 in camera space = pointing toward viewer
      const alpha = isFront ? 1.0 : 0.32;
      const lineW = isFront ? 3 : 1.5;
      const tipR  = isFront ? 5 : 3;

      const ex = cx + proj.x * len;
      const ey = cy - proj.y * len;
      const axColor = isFront ? color : neg;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Shaft
      ctx.strokeStyle = axColor;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      if (isFront) {
        // Arrow head (filled triangle)
        const ang = Math.atan2(ey - cy, ex - cx);
        const aLen = 10, aWid = 0.45;
        ctx.fillStyle = axColor;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - aLen * Math.cos(ang - aWid), ey - aLen * Math.sin(ang - aWid));
        ctx.lineTo(ex - aLen * Math.cos(ang + aWid), ey - aLen * Math.sin(ang + aWid));
        ctx.closePath();
        ctx.fill();
      } else {
        // Dot at tip for behind axes
        ctx.fillStyle = axColor;
        ctx.beginPath();
        ctx.arc(ex, ey, tipR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Label with contrasting halo
      const lx = ex + (proj.x >  0.1 ?  8 : proj.x < -0.1 ? -16 : -5);
      const ly = ey + (proj.y < -0.1 ?  14 : proj.y >  0.1 ?  -6 :  5);
      ctx.font = isFront ? 'bold 13px sans-serif' : '11px sans-serif';

      // Halo for readability on white background
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.strokeText(label, lx, ly);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = axColor;
      ctx.fillText(label, lx, ly);

      ctx.restore();
    }

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#cccccc';
    ctx.fill();
  }

  _buildOrbitTargetMarker() {
    const existing = this._container.querySelector('#orbit-target-marker');
    if (existing) existing.remove();

    const marker = document.createElement('div');
    marker.id = 'orbit-target-marker';
    marker.className = 'orbit-target-marker';
    marker.innerHTML = '<span></span>';
    this._container.appendChild(marker);
    this._orbitTargetEl = marker;
  }

  _syncOrbitTargetMarker() {
    if (!this._orbitTargetEl || !this._camera || !this._controls) return;

    const target = this._controls.target.clone();
    const projected = target.project(this._camera);
    const w = this._container.clientWidth || 1;
    const h = this._container.clientHeight || 1;
    const inFront = projected.z >= -1 && projected.z <= 1;
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    const onScreen = x >= 0 && x <= w && y >= 0 && y <= h;

    if (!inFront || !onScreen) {
      this._orbitTargetEl.style.display = 'none';
      return;
    }

    this._orbitTargetEl.style.display = 'flex';
    this._orbitTargetEl.style.left = `${x}px`;
    this._orbitTargetEl.style.top = `${y}px`;
  }

  _animate() {
    this._animId = requestAnimationFrame(() => this._animate());

    if (this._flyState.active) {
        const delta = this._clock.getDelta();
        const speed = this._flyState.keys.shift ? this._flyState.speed * 5 : this._flyState.speed;

        this._flyState.direction.z = Number(this._flyState.keys.s) - Number(this._flyState.keys.w);
        this._flyState.direction.x = Number(this._flyState.keys.d) - Number(this._flyState.keys.a);
        this._flyState.direction.y = Number(this._flyState.keys.e) - Number(this._flyState.keys.q);
        this._flyState.direction.normalize();

        if (this._flyState.keys.w || this._flyState.keys.s) this._camera.translateZ(this._flyState.direction.z * speed * delta);
        if (this._flyState.keys.a || this._flyState.keys.d) this._camera.translateX(this._flyState.direction.x * speed * delta);
        if (this._flyState.keys.e || this._flyState.keys.q) this._camera.position.y += this._flyState.direction.y * speed * delta;
    } else {
        this._controls.update();
        this._clock.getDelta(); // keep clock ticking
    }

    this._renderer.render(this._scene, this._camera);
    if (this._css2d) this._css2d.render(this._scene, this._camera);
    this._syncViewCube();
    this._syncAxisGizmo();
    this._syncOrbitTargetMarker();
  }

  _onResize() {
    const w = this._container.clientWidth;
    const h = this._container.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;

    if (this._isOrtho) {
        let maxDim = 5000;
        if (this._pipeGroup) {
          const box = new THREE.Box3().setFromObject(this._pipeGroup);
          if (!box.isEmpty()) {
             const size = box.getSize(new THREE.Vector3());
             maxDim = Math.max(size.x, size.y, size.z, 1);
          }
        }
        import('./camera-utils.js').then(({ resizeCamera }) => {
            resizeCamera(this._orthoCamera, w, h, maxDim);
        });
    } else {
        this._perspCamera.aspect = aspect;
        this._perspCamera.updateProjectionMatrix();
    }

    this._renderer.setSize(w, h);
    if (this._css2d) this._css2d.setSize(w, h);
  }

  toggleProjection() {
      const w = this._container.clientWidth;
      const h = this._container.clientHeight;
      const aspect = w / h;
      const targetDist = this._camera.position.distanceTo(this._controls.target);

      if (this._isOrtho) {
          // Ortho -> Perspective
          this._perspCamera.position.copy(this._orthoCamera.position);
          this._perspCamera.quaternion.copy(this._orthoCamera.quaternion);
          this._perspCamera.up.copy(this._orthoCamera.up);
          this._perspCamera.aspect = aspect;
          this._perspCamera.updateProjectionMatrix();
          this._camera = this._perspCamera;
          this._isOrtho = false;
          state.viewerSettings.projection = 'perspective';
      } else {
          // Perspective -> Ortho
          // match ortho frustum height to perspective view's visible height at target distance
          const fovRad = THREE.MathUtils.degToRad(this._perspCamera.fov);
          const orthoHalfHeight = Math.tan(fovRad / 2) * targetDist;

          this._orthoCamera.left = -orthoHalfHeight * aspect;
          this._orthoCamera.right = orthoHalfHeight * aspect;
          this._orthoCamera.top = orthoHalfHeight;
          this._orthoCamera.bottom = -orthoHalfHeight;

          this._orthoCamera.position.copy(this._perspCamera.position);
          this._orthoCamera.quaternion.copy(this._perspCamera.quaternion);
          this._orthoCamera.up.copy(this._perspCamera.up);
          this._orthoCamera.updateProjectionMatrix();
          this._camera = this._orthoCamera;
          this._isOrtho = true;
          state.viewerSettings.projection = 'orthographic';
      }
      this._controls.object = this._camera;
      this._controls.update();
      if (this._sectionBox) {
          this._sectionBox.updateCamera(this._camera);
      }
      this._onCameraChange();
  }

  _computeRange(elements, field) {
    const vals = elements.map(e => e[field] ?? 0).filter(v => v !== 0);
    if (!vals.length) return { min: 0, max: 100 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }

  _navigateToNode(nodeId) {
      const data = this._getGeometryData();
      if (!data || !data.nodes) return;
      const pos = data.nodes[nodeId];
      if (!pos) return;

      // We must apply the sceneRoot transform so the camera flies to the *visual* location,
      // not just the raw Three.js coordinates, otherwise we miss the object.
      const p = new THREE.Vector3(pos.y / 1000, pos.z / 1000, pos.x / 1000);
      p.applyMatrix4(this._sceneRoot.matrixWorld);

      const box = new THREE.Box3();
      if (this._pipeGroup) box.setFromObject(this._pipeGroup);
      const span = box.isEmpty() ? 500 : Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 0.1;

      // Keep existing camera direction, just translate it
      const offset = this._camera.position.clone().sub(this._controls.target);
      offset.normalize().multiplyScalar(span);

      this._camera.position.copy(p).add(offset);
      this._controls.target.copy(p);
      this._camera.lookAt(p);
      this._controls.update();
      this._onCameraChange();
  }

  rebuild() {
    this._clearGroup(this._pipeGroup);
    this._clearGroup(this._symbolGroup);
    this._clearGroup(this._labelGroup);
    this._clearGroup(this._supportLabelGroup);
    this._clearGroup(this._msgCircleGroup);
    this._clearGroup(this._msgSquareGroup);

    this._applyAxisConvention();
    this._applyTheme(true); // Don't rebuild recursively
    this._labelGroup.visible = !!state.viewerSettings.showLabels;

    if (this._sectionBox && this._sectionBox.enabled) {
        this._sectionBox.hide(); // temp hide during rebuild
    }

    const data = this._getGeometryData();
    if (!data?.elements?.length) return;

    const elements = this._getPcfElements();
    const { nodes, restraints = [], forces = [] } = data;

    for (const el of elements) {
        if (!el.fromPos && el.from !== undefined) {
           el.fromPos = nodes[el.from];
        }
        if (!el.toPos && el.to !== undefined) {
           el.toPos = nodes[el.to];
        }
    }

    const legendField = state.legendField;
    const isHeatMap = legendField.startsWith('HeatMap:');
    const heatField = isHeatMap ? legendField.split(':')[1] : null;
    const range = heatField ? this._computeRange(elements, heatField) : { min: 0, max: 100 };

    const isSolidTheme = (state.viewerSettings.themePreset || 'NavisDark') !== 'DrawLight';

    for (const el of elements) {
      if (!el.fromPos || !el.toPos) continue;

      const a = toThree(el.fromPos);
      const b = toThree(el.toPos);
      let col = colorForMode(el, legendField, range);

      if (isSolidTheme && legendField === 'pipelineRef') {
          col = 0xb8c4d2; // Navis-like neutral pipe colour
      }

      if (isSolidTheme) {
          const radius = Math.max((el.od || 100) * SCALE * 0.5, 0.05); // at least 50mm radius
          if (el.isBend || el.bend) {
             const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
             const arc = createSolidBend(a, mid, b, radius, col);
             if (arc) {
                 arc.userData.element = el;
                 this._pipeGroup.add(arc);
             }
          } else {
             const seg = createSolidCylinder(a, b, radius, col);
             if (seg) {
                 seg.userData.element = el;
                 this._pipeGroup.add(seg);
             }
          }
      } else {
          // Drawing themes (line art)
          if (el.isBend || el.bend) {
            const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
            const arc = createBendArc(a, mid, b, col, 3, this._renderer);
            arc.userData.element = el;
            this._pipeGroup.add(arc);
          } else {
            const seg = createPipeLine(a, b, col, 3, this._renderer);
            seg.userData.element = el;
            this._pipeGroup.add(seg);
          }
      }
    }

    for (const r of restraints) {
      const pos = nodes[r.node];
      if (!pos) continue;

      // Need pipe axis. Find connected element.
      const connectedEl = elements.find(e => e.from === r.node || e.to === r.node);
      const axis = new THREE.Vector3(1, 0, 0); // default
      let od = 100;
      if (connectedEl) {
          // IMPORTANT: connectedEl.dx, dy, dz are in world CAESAR space.
          // We must map them to Three.js space exactly like `toThree` does for positions:
          // threeX = caesarY, threeY = caesarZ, threeZ = caesarX.
          axis.set(connectedEl.dy, connectedEl.dz, connectedEl.dx).normalize();
          od = connectedEl.od || 100;
      }

      const type = resolveSupportRenderType(r, axis);
      if (!type) continue;
      const sym = createSupportSymbol(pos, type, axis, od);
      if (!sym) continue;
      sym.userData.restraint = r;
      sym.userData.type = type;
      this._symbolGroup.add(sym);
    }

    renderRestraintsPanel();
    this._rebuildSupportLabels();

    const forceByNode = new Map(forces.map(f => [f.node, f]));
    for (const [nodeId, pos] of Object.entries(nodes)) {
      const f = forceByNode.get(Number(nodeId));
      if (f) {
        const arrow = createForceArrow(pos, f);
        if (arrow) this._symbolGroup.add(arrow);
      }
    }

    this._rebuildLabels();
      this._updateLegendPanel(elements, legendField, range);

    if (this._sectionBox && this._sectionBox.enabled) {
        const box = new THREE.Box3();
        if (this._pipeGroup) box.setFromObject(this._pipeGroup);
        this._sectionBox.enable(box); // reset on new model
        this._applyClipping();
    }

    this._fitToScene();
  }

  _getPcfElements() {
    const data = this._getGeometryData();
    if (!data?.elements?.length) return [];
    if (state.geometryDirectData) {
      return data.elements;
    }
    try {
      const csvRows = buildUniversalCSV(data, { supportMappings: state.sticky?.supportMappings || [] });
      const pcfSegments = normalizeToPCF(csvRows, { method: 'ContEngineMethod' });
      const adapted = adaptForRenderer(pcfSegments, data);
      return adapted.elements;
    } catch (err) {
      console.warn('PCF pipeline failed, falling back to raw elements:', err);
      return data.elements;
    }
  }

  _rebuildAll() {
    const data = this._getGeometryData();
    if (!data?.elements?.length) return;
    const elements = this._getPcfElements();
    const legendField = state.legendField;
    const isHeatMap = legendField.startsWith('HeatMap:');
    const heatField = isHeatMap ? legendField.split(':')[1] : null;
    const range = heatField ? this._computeRange(elements, heatField) : { min: 0, max: 100 };

    let idx = 0;
    for (const child of this._pipeGroup.children) {
      const el = elements[idx++];
      if (el && child.material) {
        child.material.color.setHex(colorForMode(el, legendField, range));
      }
    }

    this._rebuildLabels();
    this._updateLegendPanel(elements, legendField, range);
  }

  _rebuildLabels() {
    this._clearGroup(this._labelGroup);
    this._clearGroup(this._msgCircleGroup);
    this._clearGroup(this._msgSquareGroup);
    const data = this._getGeometryData();
    if (!data?.elements?.length) return;

    // MESSAGE-CIRCLE node labels — always rendered regardless of showLabels toggle
    if (Array.isArray(data.messageCircleNodes)) {
      for (const { pos, text } of data.messageCircleNodes) {
        const lbl = createMessageCircleLabel(text, pos);
        this._msgCircleGroup.add(lbl);
      }
    }

    // MESSAGE-SQUARE annotation labels — always rendered regardless of showLabels toggle
    if (Array.isArray(data.messageSquareNodes)) {
      for (const { pos, text } of data.messageSquareNodes) {
        const lbl = createMessageSquareLabel(text, pos);
        this._msgSquareGroup.add(lbl);
      }
    }

    const elements = this._getPcfElements();
    const { nodes } = data;
    // Align with global viewer setting instead of legacy geoToggle
    const showLabels = state.viewerSettings.showLabels !== false;

    if (showLabels) {
      for (const [nodeId, pos] of Object.entries(nodes)) {
        const lbl = createNodeLabel(Number(nodeId), pos);
        this._labelGroup.add(lbl);
      }
    }

    let stretches = computeStretches(elements, state.legendField, materialFromDensity);
    const maxLabels = state.geoToggles.maxLegendLabels ?? 3;
    const stretchesByText = {};
    for (const s of stretches) {
        if (!s.text) continue;
        if (!stretchesByText[s.text]) stretchesByText[s.text] = [];
        stretchesByText[s.text].push(s);
    }

    for (const text in stretchesByText) {
        let group = stretchesByText[text];
        if (group.length > maxLabels) {
            for (let i = group.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [group[i], group[j]] = [group[j], group[i]];
            }
            group = group.slice(0, maxLabels);
        }

        for (const stretch of group) {
        const lbl = createSegmentLabel(stretch.text, stretch.midPos);
        this._labelGroup.add(lbl);
        }
    }
  }

  _rebuildSupportLabels() {
    this._clearGroup(this._supportLabelGroup);
    const data = this._getGeometryData();
    if (!data?.restraints?.length || !state.viewerSettings.showRestraintNames) {
      this._supportLabelGroup.visible = false;
      return;
    }

    const { nodes = {}, restraints = [] } = data;
    for (const r of restraints) {
      const pos = nodes[r.node];
      if (!pos) continue;

      const text = String(r.type || r.rawType || 'SUPPORT').trim();
      const lbl = createSupportLabel(text || 'SUPPORT', pos);
      this._supportLabelGroup.add(lbl);
    }

    this._supportLabelGroup.visible = true;
  }

  _updateLegendPanel(elements, legendField, range) {
    const panel = document.getElementById('legend-panel');
    if (!panel) return;

    const isHeatMap = legendField.startsWith('HeatMap:');
    const heatField = isHeatMap ? legendField.split(':')[1] : null;

    if (isHeatMap) {
      const unit = heatField === 'P1' ? ' bar' : '°C';
      const uniqueValues = [...new Set(elements.map(e => e[heatField]).filter(v => v !== undefined && v !== null))].sort((a,b)=>b-a);
      const swatches = uniqueValues.map(v => {
          const col = generateDiscreteColor(v);
          const fv = Number(v).toFixed(heatField === 'P1' ? 2 : 0);
          return `<div class="legend-row"><span class="legend-swatch" style="background:#${col.toString(16).padStart(6,'0')}"></span><span>${fv}${unit}</span></div>`;
      }).join('');

      panel.innerHTML = `
        <div class="legend-title">${heatField} Heat Map</div>
        ${swatches}
        <div class="legend-row"><span class="legend-swatch swatch-anchor"></span><span>Anchor ■</span></div>
        <div class="legend-row"><span class="legend-swatch swatch-guide"></span><span>Guide ○</span></div>
      `;
    } else {
      let swatches = '';
      if (legendField === 'material') {
        const MCOLORS = { CS:'#3a7bd5', SS:'#27ae60', AS:'#e67e22', CU:'#8e44ad', AL:'#16a085' };
        const mats = [...new Set(elements.map(e => e.material || 'CS'))];
        swatches = mats.map(m => {
          const col = MCOLORS[m.toUpperCase().slice(0, 2)] || '#888';
          return `<div class="legend-row"><span class="legend-swatch" style="background:${col}"></span><span>${m}</span></div>`;
        }).join('');
      } else {
        const uniqueValues = [...new Set(elements.map(e => e.od))].filter(v => v > 0);
        swatches = OD_COLORS
          .filter(c => uniqueValues.some(od => Math.abs(od - c.od) < 1))
          .map(c => `<div class="legend-row"><span class="legend-swatch" style="background:#${c.color.toString(16).padStart(6,'0')}"></span><span>${c.label}</span></div>`)
          .join('');
        if (!swatches) {
          swatches = `<div class="legend-row"><span class="legend-swatch" style="background:#555"></span><span>Pipe</span></div>`;
        }
      }

      const titles = { pipelineRef:'OD LEGEND', material:'MATERIAL LEGEND', T1:'T1 (°C)', T2:'T2 (°C)', P1:'P1 (bar)' };
      panel.innerHTML = `
        <div class="legend-title">${titles[legendField] || 'Legend'}</div>
        ${swatches}
        <div class="legend-row"><span class="legend-swatch swatch-anchor"></span><span>Anchor ■</span></div>
        <div class="legend-row"><span class="legend-swatch swatch-guide"></span><span>Guide ○</span></div>
        <div class="legend-row"><span class="legend-swatch swatch-load"></span><span>Applied Load ↓</span></div>
      `;
    }
  }

  _applyToggles() {
    this._symbolGroup.visible = state.geoToggles.supports;
    this._rebuildLabels();
  }

  _getGeometryData() {
    return state.geometryDirectData || state.parsed;
  }

  _fitToScene() {
      this.resetView();
  }

  toDataURL() {
    this._renderer.render(this._scene, this._camera);
    return this._renderer.domElement.toDataURL('image/png');
  }

  _clearGroup(group) {
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }

  destroy() {
    cancelAnimationFrame(this._animId);
    this._renderer.dispose();
  }
}
