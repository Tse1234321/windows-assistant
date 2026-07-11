import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import assetUrl from '../../../assets/3d/dashboard-data-universe.glb?url';

export function loadDashboardAssetKit() {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      assetUrl,
      (gltf) => {
        gltf.scene.name = 'DashboardAssetKit';
        gltf.scene.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = false;
          object.receiveShadow = false;
          object.material = object.material.clone();
          object.material.color.multiplyScalar(0.48);
          object.material.emissiveIntensity = 0.52;
          object.material.roughness = 0.32;
          object.material.transparent = true;
          object.material.opacity = 0.9;
        });
        const authoredCore = gltf.scene.getObjectByName('AssetCoreShell');
        if (authoredCore) authoredCore.visible = false;
        resolve(gltf.scene);
      },
      undefined,
      reject,
    );
  });
}
