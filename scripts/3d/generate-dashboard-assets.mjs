import fs from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.({ target: this });
      });
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;
        this.onloadend?.({ target: this });
      });
    }
  };
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..', '..');
const output = path.join(projectDir, 'src', 'assets', '3d', 'dashboard-data-universe.glb');

const root = new THREE.Group();
root.name = 'DashboardDataUniverseKit';

function material(name, color, emissive, metalness = 0.5) {
  const value = new THREE.MeshStandardMaterial({
    name,
    color,
    emissive,
    emissiveIntensity: 1.2,
    roughness: 0.24,
    metalness,
  });
  return value;
}

const cyanMetal = material('CyanMetal', 0x0b4f78, 0x0ea5e9, 0.78);
const violetMetal = material('VioletMetal', 0x26165c, 0x8b5cf6, 0.62);
const coreMaterial = material('CoreCrystal', 0x8be8ff, 0x22d3ee, 0.26);

const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.34, 0.16, 48), cyanMetal);
platform.name = 'AssetPlatform';
platform.position.y = -0.12;
root.add(platform);

const lowerDeck = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.68, 0.08, 48), violetMetal);
lowerDeck.name = 'AssetLowerDeck';
lowerDeck.position.y = -0.23;
root.add(lowerDeck);

const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 2), coreMaterial);
core.name = 'AssetCoreShell';
core.position.y = 0.36;
root.add(core);

const ringPrimary = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.028, 8, 96), cyanMetal);
ringPrimary.name = 'AssetRingPrimary';
ringPrimary.rotation.x = Math.PI / 2;
ringPrimary.position.y = -0.01;
root.add(ringPrimary);

const ringSecondary = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.018, 8, 96), violetMetal);
ringSecondary.name = 'AssetRingSecondary';
ringSecondary.rotation.set(Math.PI / 2, 0.12, 0.18);
ringSecondary.position.y = -0.17;
root.add(ringSecondary);

root.traverse((object) => {
  if (!object.isMesh) return;
  object.geometry.computeVertexNormals();
});

const exporter = new GLTFExporter();
const binary = await exporter.parseAsync(root, {
  binary: true,
  onlyVisible: true,
  truncateDrawRange: true,
});
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, Buffer.from(binary));
const stats = await fs.stat(output);
process.stdout.write(`Generated ${path.relative(projectDir, output)} (${stats.size} bytes)\n`);
