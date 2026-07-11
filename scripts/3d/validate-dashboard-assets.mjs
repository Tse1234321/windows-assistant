import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..', '..');
const input = path.join(projectDir, 'src', 'assets', '3d', 'dashboard-data-universe.glb');
const buffer = await fs.readFile(input);

if (buffer.length < 20) throw new Error('GLB is unexpectedly small.');
if (buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('Invalid GLB magic.');
if (buffer.readUInt32LE(4) !== 2) throw new Error('Only glTF 2.0 is supported.');
if (buffer.readUInt32LE(8) !== buffer.length) throw new Error('GLB byte length header mismatch.');
if (buffer.length > 1_500_000) throw new Error(`GLB exceeds the 1.5 MB budget: ${buffer.length}`);

const jsonLength = buffer.readUInt32LE(12);
const chunkType = buffer.toString('ascii', 16, 20);
if (chunkType !== 'JSON') throw new Error('First GLB chunk is not JSON.');
const json = JSON.parse(
  buffer
    .toString('utf8', 20, 20 + jsonLength)
    .split(String.fromCharCode(0))
    .join('')
    .trim(),
);
const names = new Set((json.nodes || []).map((node) => node.name));
const required = [
  'AssetPlatform',
  'AssetLowerDeck',
  'AssetCoreShell',
  'AssetRingPrimary',
  'AssetRingSecondary',
];
const missing = required.filter((name) => !names.has(name));
if (missing.length) throw new Error(`GLB is missing required nodes: ${missing.join(', ')}`);
if (json.images?.length || json.textures?.length)
  throw new Error('The runtime kit must remain texture-free.');
if ((json.buffers || []).some((item) => item.uri))
  throw new Error('The runtime GLB must not reference external buffers.');

const materialNames = new Set((json.materials || []).map((material) => material.name));
const requiredMaterials = ['CyanMetal', 'VioletMetal', 'CoreCrystal'];
const missingMaterials = requiredMaterials.filter((name) => !materialNames.has(name));
if (missingMaterials.length)
  throw new Error(`GLB is missing required materials: ${missingMaterials.join(', ')}`);

const positionAccessors = (json.meshes || [])
  .flatMap((mesh) => mesh.primitives || [])
  .map((primitive) => json.accessors?.[primitive.attributes?.POSITION])
  .filter(Boolean);
const bounds = positionAccessors.flatMap((accessor) => [...(accessor.min || []), ...(accessor.max || [])]);
if (!bounds.length || bounds.some((value) => !Number.isFinite(value)))
  throw new Error('GLB mesh bounds are missing or invalid.');
const maxAbsoluteCoordinate = Math.max(...bounds.map(Math.abs));
if (maxAbsoluteCoordinate > 5 || maxAbsoluteCoordinate < 0.1)
  throw new Error(`GLB scale is outside the expected metre-space range: ${maxAbsoluteCoordinate}`);

process.stdout.write(
  `Validated ${path.relative(projectDir, input)}: glTF 2.0, ${buffer.length} bytes, ${json.meshes?.length || 0} meshes, ${json.materials?.length || 0} materials, max coordinate ${maxAbsoluteCoordinate.toFixed(3)} m, no external resources.\n`,
);
