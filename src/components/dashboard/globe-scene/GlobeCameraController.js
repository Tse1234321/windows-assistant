import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class GlobeCameraController {
  constructor(camera, element, { compact = false, reducedMotion = false } = {}) {
    this.camera = camera;
    this.compact = compact;
    this.reducedMotion = reducedMotion;
    this.controls = new OrbitControls(camera, element);
    this.controls.enableDamping = !reducedMotion;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.rotateSpeed = 0.48;
    this.controls.zoomSpeed = 0.72;
    this.controls.minDistance = compact ? 4.9 : 4.4;
    this.controls.maxDistance = compact ? 12.5 : 11.5;
    this.controls.minPolarAngle = Math.PI * 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.78;
    this.controls.target.set(0, 0, 0);
    this.overviewPosition = new THREE.Vector3(0, compact ? 0.15 : 0.28, compact ? 9.15 : 7.8);
    this.idlePosition = new THREE.Vector3(0, 0.08, 6.25);
    this.goalPosition = this.idlePosition.clone();
    this.goalTarget = new THREE.Vector3();
    this.focusedId = null;
    this.manual = false;
    camera.position.copy(this.idlePosition);
    this.controls.addEventListener('start', () => {
      this.manual = true;
      this.focusedId = null;
    });
    this.controls.addEventListener('end', () => {
      this.goalPosition.copy(this.camera.position);
      this.goalTarget.copy(this.controls.target);
    });
    this.controls.update();
  }

  setOpenProgress(progress) {
    if (this.focusedId || this.manual) return;
    this.goalPosition.lerpVectors(this.idlePosition, this.overviewPosition, progress);
    this.goalTarget.set(0, 0, 0);
  }

  focusNode(id, worldPosition) {
    if (!id || !worldPosition) return;
    this.manual = false;
    this.focusedId = id;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const distance = this.compact ? 7.2 : 6.7;
    this.goalTarget.copy(worldPosition).multiplyScalar(0.55);
    this.goalPosition.copy(this.goalTarget).add(direction.multiplyScalar(distance));
    if (this.reducedMotion) {
      this.camera.position.copy(this.goalPosition);
      this.controls.target.copy(this.goalTarget);
    }
  }

  reset(open = true) {
    this.focusedId = null;
    this.manual = false;
    this.goalPosition.copy(open ? this.overviewPosition : this.idlePosition);
    this.goalTarget.set(0, 0, 0);
    if (this.reducedMotion) {
      this.camera.position.copy(this.goalPosition);
      this.controls.target.copy(this.goalTarget);
    }
  }

  update() {
    if (this.manual) {
      this.controls.update();
      return;
    }
    const amount = this.reducedMotion ? 1 : 0.085;
    this.camera.position.lerp(this.goalPosition, amount);
    this.controls.target.lerp(this.goalTarget, amount);
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
