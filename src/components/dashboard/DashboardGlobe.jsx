import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { formatBytes } from '../../utils/format.js';
import { useLocale } from '../../i18n.jsx';
import { isLand } from './earthLandmask.js';

const STATUS_ORDER = { danger: 4, warning: 3, normal: 2, good: 1 };

const STATUS_COLORS = {
  good: 0x22d3ee,
  normal: 0xa855f7,
  warning: 0xd946ef,
  danger: 0xff4f83,
};

const TYPE_COLORS = {
  file: 0x38bdf8,
  project: 0xa78bfa,
  system: 0x22d3ee,
  cleanup: 0xd946ef,
  automation: 0x22d3ee,
};

function hash(input) {
  return String(input || '')
    .split('')
    .reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0);
}

function getNodeValue(node) {
  return Math.max(1, Number(node?.value || node?.count || node?.sizeBytes || 1));
}

function sphericalPosition(index, total, seed, radius = 2.34) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(1, total - 1)) * 2;
  const bandRadius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = golden * index + ((seed % 360) * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(theta) * bandRadius * radius,
    y * radius,
    Math.sin(theta) * bandRadius * radius,
  );
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.18, 'rgba(56,189,248,0.72)');
  gradient.addColorStop(0.52, 'rgba(168,85,247,0.28)');
  gradient.addColorStop(0.72, 'rgba(217,70,239,0.18)');
  gradient.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  return new THREE.CanvasTexture(canvas);
}

function makeLandPoints(count = 20000, radius = 2.365) {
  const positions = [];
  const colors = [];
  const primary = new THREE.Color(0x67e8f9);
  const secondary = new THREE.Color(0xa78bfa);
  const accent = new THREE.Color(0xd946ef);
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / Math.max(1, count - 1)) * 2;
    const latDeg = (Math.asin(THREE.MathUtils.clamp(y, -1, 1)) * 180) / Math.PI;
    const lonDeg = (((((golden * index * 180) / Math.PI) % 360) + 540) % 360) - 180;
    if (!isLand(latDeg, lonDeg)) continue;

    const lat = (latDeg * Math.PI) / 180;
    const lon = (lonDeg * Math.PI) / 180;
    positions.push(
      radius * Math.cos(lat) * Math.sin(lon),
      radius * Math.sin(lat),
      radius * Math.cos(lat) * Math.cos(lon),
    );
    const noise = Math.abs(Math.sin(index * 12.9898) * 43758.5453);
    const color = index % 13 === 0 ? accent : index % 5 === 0 ? secondary : primary;
    const strength = 0.45 + (noise % 0.55);
    colors.push(color.r * strength, color.g * strength, color.b * strength);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function makeStarLayer(count, seedOffset = 0) {
  const positions = [];
  const colors = [];
  const palette = [new THREE.Color(0xffffff), new THREE.Color(0x9dd8ff), new THREE.Color(0xc4b5fd)];

  for (let index = 0; index < count; index += 1) {
    const seed = hash(`star-${seedOffset}-${index}`);
    const u = ((seed % 1000) + 1000) % 1000;
    const v = (((seed >> 5) % 1000) + 1000) % 1000;
    const w = (((seed >> 10) % 1000) + 1000) % 1000;
    const theta = (u / 1000) * Math.PI * 2;
    const phi = Math.acos((v / 1000) * 2 - 1);
    const radius = 5.4 + (w / 1000) * 4.2;
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * 0.72,
      -Math.abs(radius * Math.sin(phi) * Math.sin(theta)) - 1.2,
    );
    const color = palette[seed % 3 === 0 ? 2 : seed % 2 === 0 ? 1 : 0];
    const strength = 0.45 + ((((seed >> 3) % 100) + 100) % 100) / 180;
    colors.push(color.r * strength, color.g * strength, color.b * strength);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.038,
      transparent: true,
      opacity: 0.85,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
}

function makeOrbit(radius, yScale, segments = 192) {
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * yScale, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function makeArc(from, to) {
  const midpoint = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(3.1);
  const curve = new THREE.QuadraticBezierCurve3(from, midpoint, to);
  return { curve, geometry: new THREE.BufferGeometry().setFromPoints(curve.getPoints(44)) };
}

function supportsWebGl() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch (_) {
    return false;
  }
}

function statusLabel(t, status) {
  if (status === 'good') return t('dashboard.good');
  if (status === 'warning') return t('dashboard.attention');
  if (status === 'danger') return t('dashboard.danger');
  return t('dashboard.normal');
}

function describeAmount(node, t) {
  if (!node) return t('dashboard.unavailable');
  if (node.meta?.unavailable) return t('dashboard.unavailable');
  const parts = [];
  if (node.count != null)
    parts.push(`${new Intl.NumberFormat().format(node.count)} ${t('dashboard.files')}`);
  if (node.sizeBytes != null) parts.push(formatBytes(node.sizeBytes));
  if (!parts.length && node.value != null) parts.push(new Intl.NumberFormat().format(node.value));
  return parts.join(' / ') || t('dashboard.unavailable');
}

function tooltipLine(label, value) {
  if (value == null || value === '') return null;
  return (
    <span>
      <b>{label}</b>
      {value}
    </span>
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function DashboardGlobe({
  nodes = [],
  loading = false,
  selectedNode = null,
  onNodeSelect,
  onNodeClear,
  onNodeOpen,
  liveMetrics = null,
  statusFilter = null,
}) {
  const { t } = useLocale();
  const stageRef = useRef(null);
  const selectedNodeIdRef = useRef(selectedNode?.id || null);
  const liveMetricsRef = useRef({});
  const statusFilterRef = useRef(null);
  const [hasWebGl, setHasWebGl] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [selectedAnchor, setSelectedAnchor] = useState(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 720 : window.innerHeight,
  }));

  const displayNodes = useMemo(() => {
    return [...nodes]
      .sort(
        (a, b) =>
          (STATUS_ORDER[b.status] || 0) - (STATUS_ORDER[a.status] || 0) ||
          getNodeValue(b) - getNodeValue(a),
      )
      .slice(0, 34);
  }, [nodes]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNode?.id || null;
    if (!selectedNode) setSelectedAnchor(null);
  }, [selectedNode]);

  useEffect(() => {
    liveMetricsRef.current = liveMetrics || {};
  }, [liveMetrics]);

  useEffect(() => {
    statusFilterRef.current = statusFilter?.length ? new Set(statusFilter) : null;
  }, [statusFilter]);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    if (!supportsWebGl()) {
      setHasWebGl(false);
      return undefined;
    }

    setHasWebGl(true);
    stage.replaceChildren();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, 0.08, 6.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'globe-webgl-canvas';
    stage.appendChild(renderer.domElement);

    const root = new THREE.Group();
    root.rotation.set(-0.12, -0.4, 0.02);
    scene.add(root);

    const statusColors = STATUS_COLORS;
    const typeColors = TYPE_COLORS;
    const selectedColor = 0xe0fbff;
    const haloColor = 0x67e8f9;
    const linkPrimary = 0x22d3ee;
    const linkSecondary = 0xa78bfa;

    scene.add(new THREE.AmbientLight(0x8bdfff, 0.76));
    const keyLight = new THREE.DirectionalLight(0x67e8f9, 2.2);
    keyLight.position.set(-3, 3, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x38bdf8, 8.5, 8);
    rimLight.position.set(0, -0.4, 3.3);
    scene.add(rimLight);
    const purpleRimLight = new THREE.PointLight(0xd946ef, 6.8, 8);
    purpleRimLight.position.set(2.8, 1.2, 2.8);
    scene.add(purpleRimLight);

    const globeGeometry = new THREE.SphereGeometry(2.22, 96, 96);
    const globeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x080f35,
      emissive: 0x24115f,
      emissiveIntensity: 0.78,
      roughness: 0.36,
      metalness: 0.05,
      transmission: 0.18,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    root.add(globe);

    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(2.235, 36, 20)),
      new THREE.LineBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.18,
      }),
    );
    root.add(wire);

    const starGroup = new THREE.Group();
    const starLayerA = makeStarLayer(420, 1);
    const starLayerB = makeStarLayer(420, 2);
    starGroup.add(starLayerA);
    starGroup.add(starLayerB);
    scene.add(starGroup);

    const cityPoints = new THREE.Points(
      makeLandPoints(20000, 2.365),
      new THREE.PointsMaterial({
        size: 0.017,
        transparent: true,
        opacity: 0.9,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    root.add(cityPoints);

    const glowTexture = makeGlowTexture();
    const maxValue = Math.max(1, ...displayNodes.map(getNodeValue));
    const nodeMeshes = [];
    const selectedHaloSprites = [];
    const positionedNodes = displayNodes.map((node, index) => ({
      node,
      position: sphericalPosition(
        index,
        displayNodes.length,
        Math.abs(hash(node.id || node.label)),
      ),
    }));

    positionedNodes.forEach(({ node, position }) => {
      const value = getNodeValue(node);
      const normalized = Math.sqrt(value / maxValue);
      const radius = 0.07 + normalized * 0.12;
      const color = statusColors[node.status] || typeColors[node.type] || 0x38bdf8;

      const group = new THREE.Group();
      group.position.copy(position);
      group.lookAt(0, 0, 0);

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 20, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96 }),
      );
      mesh.userData.dashboardNode = node;
      mesh.userData.baseRadius = radius;
      mesh.userData.alert =
        node.status === 'danger' || node.status === 'warning' || value > maxValue * 0.74;
      mesh.userData.defaultColor = color;
      group.add(mesh);

      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.scale.setScalar(radius * 7.5);
      group.add(sprite);

      const halos = [0, 1, 2].map((haloIndex) => {
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture,
            color: haloColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        halo.visible = false;
        halo.scale.setScalar(radius * (11 + haloIndex * 4));
        group.add(halo);
        selectedHaloSprites.push(halo);
        return halo;
      });
      mesh.userData.glowSprite = sprite;
      mesh.userData.selectionHalos = halos;

      root.add(group);
      nodeMeshes.push(mesh);
    });

    const linkRecords = [];
    positionedNodes.slice(0, 20).forEach((entry, index, list) => {
      const next = list[(index * 5 + 3) % list.length];
      if (!next || next.node.id === entry.node.id) return;
      const arc = makeArc(entry.position, next.position);
      const material = new THREE.LineBasicMaterial({
        color: index % 5 === 0 ? linkSecondary : linkPrimary,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(arc.geometry, material);
      root.add(line);

      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.027, 10, 10),
        new THREE.MeshBasicMaterial({ color: material.color, transparent: true, opacity: 0.95 }),
      );
      root.add(pulse);
      linkRecords.push({ curve: arc.curve, pulse, offset: index / Math.max(1, list.length) });
    });

    const orbitGroup = new THREE.Group();
    const orbits = [
      { radius: 2.72, yScale: 0.38, rot: [0.1, 0.4, 0.1], color: 0x22d3ee },
      { radius: 2.9, yScale: 0.26, rot: [0.82, -0.32, 0.45], color: 0x3b82f6 },
      { radius: 3.06, yScale: 0.44, rot: [-0.42, 0.95, -0.18], color: 0xa78bfa },
    ];
    orbits.forEach((orbit) => {
      const ring = new THREE.Line(
        makeOrbit(orbit.radius, orbit.yScale),
        new THREE.LineBasicMaterial({
          color: orbit.color,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
        }),
      );
      ring.rotation.set(...orbit.rot);
      orbitGroup.add(ring);
    });
    scene.add(orbitGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const drag = { active: false, x: 0, y: 0, moved: false, vx: 0, vy: 0 };
    const spin = { x: 0, y: 0 };
    const focus = { active: false, targetX: 0, targetY: 0 };
    const parallax = { x: 0, y: 0 };
    const baseEmissiveIntensity = globeMaterial.emissiveIntensity;
    const baseRimIntensity = rimLight.intensity;
    let hoveredMesh = null;
    let cameraDistance = 6.2;
    let animationFrame = 0;
    let frameCount = 0;
    const worldPosition = new THREE.Vector3();

    const focusOnMesh = (mesh) => {
      const anchor = mesh.parent?.position || mesh.position;
      const horizontal = Math.hypot(anchor.x, anchor.z);
      let targetY = Math.atan2(-anchor.x, anchor.z);
      const twoPi = Math.PI * 2;
      targetY += twoPi * Math.round((root.rotation.y - targetY) / twoPi);
      focus.targetY = targetY;
      focus.targetX = THREE.MathUtils.clamp(Math.atan2(anchor.y, horizontal), -0.78, 0.78);
      focus.active = true;
      spin.x = 0;
      spin.y = 0;
    };

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(380, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const setPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const clearHover = () => {
      if (hoveredMesh && hoveredMesh.userData.dashboardNode?.id !== selectedNodeIdRef.current)
        hoveredMesh.scale.setScalar(1);
      hoveredMesh = null;
      setHovered(null);
    };

    const onPointerLeave = () => {
      parallax.x = 0;
      parallax.y = 0;
      clearHover();
    };

    const findHit = (event) => {
      setPointer(event);
      parallax.x = pointer.x;
      parallax.y = pointer.y;
      raycaster.setFromCamera(pointer, camera);
      const visibleMeshes = nodeMeshes.filter((mesh) => !mesh.userData.filteredOut);
      return raycaster.intersectObjects(visibleMeshes, false)[0]?.object || null;
    };

    const updateHover = (event) => {
      const hitObject = findHit(event);
      const hit = hitObject ? { object: hitObject } : null;
      if (!hit) {
        clearHover();
        return;
      }

      if (
        hoveredMesh &&
        hoveredMesh !== hit.object &&
        hoveredMesh.userData.dashboardNode?.id !== selectedNodeIdRef.current
      ) {
        hoveredMesh.scale.setScalar(1);
      }
      hoveredMesh = hit.object;
      if (hoveredMesh.userData.dashboardNode?.id !== selectedNodeIdRef.current)
        hoveredMesh.scale.setScalar(1.55);

      const stageRect = stage.getBoundingClientRect();
      setHovered({
        node: hit.object.userData.dashboardNode,
        x: event.clientX - stageRect.left,
        y: event.clientY - stageRect.top,
      });
    };

    const onPointerDown = (event) => {
      drag.active = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.moved = false;
      drag.vx = 0;
      drag.vy = 0;
      spin.x = 0;
      spin.y = 0;
      if (event.pointerId != null) renderer.domElement.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (drag.active) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) {
          drag.moved = true;
          focus.active = false;
        }
        root.rotation.y += dx * 0.006;
        root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + dy * 0.004, -0.78, 0.78);
        drag.vx = dx * 0.006;
        drag.vy = dy * 0.004;
        drag.x = event.clientX;
        drag.y = event.clientY;
      }
      updateHover(event);
    };

    const onPointerUp = (event) => {
      if (drag.active && drag.moved) {
        spin.y = THREE.MathUtils.clamp(drag.vx, -0.09, 0.09);
        spin.x = THREE.MathUtils.clamp(drag.vy, -0.06, 0.06);
      }
      drag.active = false;
      if (event.pointerId != null) renderer.domElement.releasePointerCapture?.(event.pointerId);
    };

    const onClick = (event) => {
      if (drag.moved) return;
      const clickedMesh = findHit(event) || hoveredMesh;
      if (clickedMesh?.userData?.dashboardNode) {
        onNodeSelect?.(clickedMesh.userData.dashboardNode);
        clickedMesh.scale.setScalar(1.7);
        focusOnMesh(clickedMesh);
      } else {
        onNodeClear?.();
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
      cameraDistance = THREE.MathUtils.clamp(cameraDistance + event.deltaY * 0.0022, 5.25, 7.3);
      camera.position.z = cameraDistance;
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('mousedown', onPointerDown);
    renderer.domElement.addEventListener('mousemove', onPointerMove);
    renderer.domElement.addEventListener('mouseup', onPointerUp);
    renderer.domElement.addEventListener('mouseleave', onPointerLeave);
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const animate = (time) => {
      const seconds = time * 0.001;
      const live = liveMetricsRef.current || {};
      const cpu01 = THREE.MathUtils.clamp(Number(live.cpuPercent) / 100 || 0, 0, 1);
      const mem01 = THREE.MathUtils.clamp(Number(live.memoryPercent) / 100 || 0, 0, 1);
      const filter = statusFilterRef.current;

      if (focus.active && !drag.active) {
        root.rotation.y += (focus.targetY - root.rotation.y) * 0.07;
        root.rotation.x += (focus.targetX - root.rotation.x) * 0.07;
        if (
          Math.abs(focus.targetY - root.rotation.y) < 0.004 &&
          Math.abs(focus.targetX - root.rotation.x) < 0.004
        )
          focus.active = false;
      } else {
        root.rotation.y += selectedNodeIdRef.current
          ? 0.0004
          : hoveredMesh || drag.active
            ? 0.0007
            : 0.0019;
        if (!drag.active && (spin.x || spin.y)) {
          root.rotation.y += spin.y;
          root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + spin.x, -0.78, 0.78);
          spin.x = Math.abs(spin.x) < 0.00005 ? 0 : spin.x * 0.94;
          spin.y = Math.abs(spin.y) < 0.00005 ? 0 : spin.y * 0.94;
        }
      }

      camera.position.x += (parallax.x * 0.24 - camera.position.x) * 0.05;
      camera.position.y += (0.08 + parallax.y * 0.16 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);

      globeMaterial.emissiveIntensity =
        baseEmissiveIntensity * (0.9 + cpu01 * 0.4 + Math.sin(seconds * (0.9 + cpu01 * 2.4)) * 0.1);
      rimLight.intensity = baseRimIntensity * (0.9 + mem01 * 0.35);

      orbitGroup.rotation.y -= 0.0015;
      orbitGroup.rotation.z += 0.0005;
      starGroup.rotation.y += 0.00035;
      starLayerA.material.opacity = 0.72 + Math.sin(seconds * 1.4) * 0.2;
      starLayerB.material.opacity = 0.72 - Math.sin(seconds * 1.4) * 0.2;
      cityPoints.material.opacity = 0.74 + Math.sin(seconds * 1.7) * 0.12;
      frameCount += 1;

      nodeMeshes.forEach((mesh, index) => {
        const node = mesh.userData.dashboardNode;
        const isSelected = node?.id === selectedNodeIdRef.current;
        const filteredOut = Boolean(filter && node && !filter.has(node.status) && !isSelected);
        mesh.userData.filteredOut = filteredOut;
        const material = mesh.material;
        const sprite = mesh.userData.glowSprite;
        const halos = mesh.userData.selectionHalos || [];

        if (isSelected) {
          const beat = (Math.sin(seconds * 4.2) + 1) / 2;
          mesh.scale.setScalar(1.48 + beat * 0.28);
          material.color.setHex(selectedColor);
          material.opacity = 1;
          if (sprite) {
            sprite.material.opacity = 1;
            sprite.scale.setScalar(mesh.userData.baseRadius * (10.5 + beat * 2));
          }
          halos.forEach((halo, haloIndex) => {
            const phase = (seconds / 1.55 + haloIndex / 3) % 1;
            halo.visible = true;
            halo.material.opacity = (1 - phase) * 0.46;
            halo.scale.setScalar(mesh.userData.baseRadius * (11 + phase * 20 + haloIndex * 3));
          });

          if (frameCount % 6 === 0) {
            mesh.getWorldPosition(worldPosition);
            const projected = worldPosition.clone().project(camera);
            const rect = renderer.domElement.getBoundingClientRect();
            setSelectedAnchor({
              x: (projected.x * 0.5 + 0.5) * rect.width + rect.left,
              y: (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
            });
          }
          return;
        }

        material.color.setHex(mesh.userData.defaultColor);
        halos.forEach((halo) => {
          halo.visible = false;
          halo.material.opacity = 0;
        });

        if (filteredOut) {
          material.opacity += (0.07 - material.opacity) * 0.16;
          if (sprite) sprite.material.opacity += (0.03 - sprite.material.opacity) * 0.16;
          mesh.scale.setScalar(Math.max(0.8, mesh.scale.x * 0.96));
          return;
        }

        material.opacity = 0.96;
        if (sprite) {
          sprite.material.opacity = 0.75;
          sprite.scale.setScalar(mesh.userData.baseRadius * 7.5);
        }
        if (mesh === hoveredMesh) return;
        const pulse = mesh.userData.alert ? 0.22 : 0.09;
        const pulseSpeed = node?.type === 'system' ? 2.4 + cpu01 * 3.4 : 2.4;
        mesh.scale.setScalar(1 + Math.sin(seconds * pulseSpeed + index) * pulse);
      });

      linkRecords.forEach((record, index) => {
        const point = record.curve.getPoint((seconds * 0.12 + record.offset + index * 0.013) % 1);
        record.pulse.position.copy(point);
      });

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('mousedown', onPointerDown);
      renderer.domElement.removeEventListener('mousemove', onPointerMove);
      renderer.domElement.removeEventListener('mouseup', onPointerUp);
      renderer.domElement.removeEventListener('mouseleave', onPointerLeave);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('wheel', onWheel);
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material))
            object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      selectedHaloSprites.length = 0;
      glowTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === stage) stage.removeChild(renderer.domElement);
    };
  }, [displayNodes, onNodeClear, onNodeSelect]);

  const tooltipNode = hovered?.node;
  const selected = selectedNode;
  const canUsePortal = typeof document !== 'undefined' && selected;
  const panelWidth = viewport.width < 760 ? Math.max(300, viewport.width - 32) : 380;
  const panelLeft = viewport.width < 760 ? 16 : viewport.width - panelWidth - 32;
  const panelTop =
    viewport.width < 760
      ? clamp(
          (selectedAnchor?.y || viewport.height * 0.5) + 42,
          72,
          Math.max(72, viewport.height - 360),
        )
      : clamp(
          (selectedAnchor?.y || viewport.height * 0.45) - 160,
          86,
          Math.max(86, viewport.height - 390),
        );
  const connectorEnd = {
    x: panelLeft,
    y: panelTop + 142,
  };
  const connectorPath = selectedAnchor
    ? `M ${selectedAnchor.x.toFixed(1)} ${selectedAnchor.y.toFixed(1)} C ${(selectedAnchor.x + 90).toFixed(1)} ${selectedAnchor.y.toFixed(1)}, ${(connectorEnd.x - 90).toFixed(1)} ${connectorEnd.y.toFixed(1)}, ${connectorEnd.x.toFixed(1)} ${connectorEnd.y.toFixed(1)}`
    : '';

  return (
    <section className="dashboard-globe-card glass-card hologram-globe-card">
      <div className="globe-scanline" />
      <div ref={stageRef} className="globe-stage" aria-label="Interactive 3D data globe" />

      {loading ? (
        <div className="globe-loading">
          <span className="dash-skeleton dash-skeleton-orb" />
          <span>{t('dashboard.loadingNodes')}</span>
        </div>
      ) : null}

      {!loading && displayNodes.length === 0 ? (
        <div className="globe-empty-state">
          <strong>{t('dashboard.noLiveNodes')}</strong>
          <span>{t('dashboard.noClassifiedHint')}</span>
        </div>
      ) : null}

      {!hasWebGl ? (
        <div className="globe-fallback">
          <div className="globe-fallback-orb" />
          <strong>WebGL is unavailable</strong>
          <span>The dashboard is showing a static technology globe fallback.</span>
        </div>
      ) : null}

      {tooltipNode ? (
        <div
          className="globe-tooltip globe-tooltip-dark"
          style={{
            left: `${Math.min(Math.max(hovered.x + 16, 18), Math.max(18, (stageRef.current?.clientWidth || 360) - 230))}px`,
            top: `${Math.min(Math.max(hovered.y - 16, 18), Math.max(18, (stageRef.current?.clientHeight || 420) - 140))}px`,
          }}
        >
          <strong>{tooltipNode.label}</strong>
          {tooltipLine(t('dashboard.status'), statusLabel(t, tooltipNode.status))}
          {tooltipLine(t('dashboard.type'), tooltipNode.type)}
          {tooltipLine(t('dashboard.size'), describeAmount(tooltipNode, t))}
          {tooltipLine(
            t('dashboard.updated'),
            tooltipNode.updatedAt
              ? new Date(tooltipNode.updatedAt).toLocaleString()
              : t('dashboard.unavailable'),
          )}
        </div>
      ) : null}

      {canUsePortal
        ? createPortal(
            <>
              {selectedAnchor ? (
                <svg
                  className="globe-detail-connector"
                  width={viewport.width}
                  height={viewport.height}
                  aria-hidden="true"
                >
                  <path d={connectorPath} />
                  <circle
                    className="connector-origin"
                    cx={selectedAnchor.x}
                    cy={selectedAnchor.y}
                    r="7"
                  />
                  <circle
                    className="connector-origin connector-origin-pulse"
                    cx={selectedAnchor.x}
                    cy={selectedAnchor.y}
                    r="14"
                  />
                </svg>
              ) : null}
              <aside
                className="globe-detail-panel"
                style={{
                  width: panelWidth,
                  left: panelLeft,
                  top: panelTop,
                }}
              >
                <header>
                  <span>{selected.type}</span>
                  <button type="button" onClick={onNodeClear} aria-label="Close selected node">
                    x
                  </button>
                </header>
                <strong>{selected.label}</strong>
                <dl>
                  <div>
                    <dt>{t('dashboard.status')}</dt>
                    <dd className={`status-text-${selected.status}`}>
                      {statusLabel(t, selected.status)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('dashboard.size')}</dt>
                    <dd>{describeAmount(selected, t)}</dd>
                  </div>
                  <div>
                    <dt>{t('dashboard.updated')}</dt>
                    <dd>
                      {selected.updatedAt
                        ? new Date(selected.updatedAt).toLocaleString()
                        : t('dashboard.unavailable')}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="globe-open-button"
                  onClick={() => onNodeOpen?.(selected)}
                  disabled={!selected.route}
                >
                  {t('dashboard.open')}
                </button>
              </aside>
            </>,
            document.body,
          )
        : null}
    </section>
  );
}
