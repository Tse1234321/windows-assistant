import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { useLocale } from '../../i18n.jsx';
import { formatBytes } from '../../utils/format.js';
import GlobeNodePanel from './GlobeNodePanel.jsx';
import {
  buildGlobeLayout,
  getNodeValue,
  groupDashboardNodes,
  scoreDashboardNode,
} from './globeLayout.js';
import { createSpaceEnvironment } from './globe-scene/createSpaceEnvironment.js';
import { GlobeCameraController } from './globe-scene/GlobeCameraController.js';
import { loadDashboardAssetKit } from './globe-scene/loadDashboardAssetKit.js';
import { useDashboardNodeExplorer } from './useDashboardNodeExplorer.js';

const STATUS_COLORS = {
  good: 0x22d3ee,
  normal: 0xa78bfa,
  warning: 0xf472b6,
  danger: 0xfb7185,
};

const TRANSITION_MS = 720;
const GLOBE_RADIUS = 1.62;

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function makeCircuitTexture(compact) {
  const size = compact ? 512 : 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#081431';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(50,110,190,.14)';
  g.lineWidth = 1;
  for (let i = 0; i <= 32; i += 1) {
    g.beginPath();
    g.moveTo((i * size) / 32, 0);
    g.lineTo((i * size) / 32, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, (i * size) / 32);
    g.lineTo(size, (i * size) / 32);
    g.stroke();
  }
  const traceColors = ['#1e5f9e', '#2f7fd0', '#35e0ff', '#7a5cff', '#4da3ff'];
  const traceCount = compact ? 120 : 230;
  for (let n = 0; n < traceCount; n += 1) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    const color = traceColors[(Math.random() * traceColors.length) | 0];
    g.strokeStyle = color;
    g.globalAlpha = 0.35 + Math.random() * 0.5;
    g.lineWidth = 1.5 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    const segments = 2 + ((Math.random() * 3) | 0);
    for (let s = 0; s < segments; s += 1) {
      const length = size * (0.03 + Math.random() * 0.12);
      if (Math.random() < 0.5) x += (Math.random() < 0.5 ? -1 : 1) * length;
      else y += (Math.random() < 0.5 ? -1 : 1) * length;
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  const chipCount = compact ? 14 : 26;
  for (let n = 0; n < chipCount; n += 1) {
    const w = size * (0.025 + Math.random() * 0.045);
    const h = size * (0.025 + Math.random() * 0.045);
    const x = Math.random() * (size - w);
    const y = Math.random() * (size - h);
    g.fillStyle = 'rgba(20,44,92,.9)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(90,190,255,.8)';
    g.lineWidth = 1.5;
    g.strokeRect(x, y, w, h);
    g.fillStyle = 'rgba(120,220,255,.9)';
    g.fillRect(x + w / 2 - 3, y + h / 2 - 3, 6, 6);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

// Holographic shell: latitude/longitude dot matrix, noise-based pseudo
// continents and a Fresnel rim so the sphere reads as a hologram from
// every angle without requiring a real landmask texture.
const HOLO_VERTEX = /* glsl */ `
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewPos; varying vec3 vObjPos;
  void main(){
    vUv = uv; vObjPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const HOLO_FRAGMENT = /* glsl */ `
  uniform float uTime; uniform float uOpacity;
  uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uSeed;
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewPos; varying vec3 vObjPos;
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0*floor(p*ns.z*ns.z);
    vec4 x_ = floor(j*ns.z);
    vec4 y_ = floor(j - 7.0*x_);
    vec4 x = x_*ns.x + ns.yyyy;
    vec4 y = y_*ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m*m;
    return 42.0*dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  float fbm(vec3 p){
    float a = 0.5, s = 0.0;
    for(int i=0;i<4;i++){ s += a*snoise(p); p *= 2.03; a *= 0.5; }
    return s;
  }
  void main(){
    vec2 grid = vUv * vec2(190.0, 95.0);
    vec2 gf = fract(grid) - 0.5;
    float dotm = smoothstep(0.38, 0.12, length(gf));
    float land = fbm(normalize(vObjPos)*1.65 + uSeed);
    float landMask = smoothstep(0.02, 0.17, land);
    float glow = dotm * (0.16 + landMask*1.2);
    glow *= 0.86 + 0.14*sin(uTime*1.4 + vUv.x*42.0);
    float fres = pow(1.0 - abs(dot(normalize(vViewPos), normalize(vNormal))), 2.6);
    float lines = smoothstep(0.985, 1.0, abs(sin(vUv.y*3.14159*36.0)))*0.10;
    vec3 col = uColorA*glow + mix(uColorA, uColorB, 0.55)*fres*1.55;
    float alpha = (glow*0.95 + fres*0.55 + lines) * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }`;

function makeHoloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uColorA: { value: new THREE.Color(0x39c8ff) },
      uColorB: { value: new THREE.Color(0x8e5bff) },
      uSeed: { value: new THREE.Vector3(3.7, 1.9, 5.2) },
    },
    vertexShader: HOLO_VERTEX,
    fragmentShader: HOLO_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeBeamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpen: { value: 0.4 },
      uColor: { value: new THREE.Color(0x66d8ff) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewPos;
      void main(){
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOpen; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vViewPos;
      void main(){
        float edge = smoothstep(0.0,0.18,vUv.y)*smoothstep(1.0,0.82,vUv.y);
        float stripes = 0.5 + 0.5*sin(vUv.y*22.0 - uTime*3.0);
        float facing = pow(max(dot(normalize(vViewPos), normalize(vNormal)), 0.0), 1.3);
        float a = edge*(0.22 + 0.32*stripes)*facing*uOpen;
        gl_FragColor = vec4(uColor*(0.8+0.5*stripes), a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeRing(radius, color, opacity, tube = 0.007) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 8, 200),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  return ring;
}

// Shared "document lines" texture: faint text bars shown on folder pockets
// and file sheets, matching the reference artwork.
function makeDocLinesTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  [
    [20, 30, 72],
    [20, 52, 88],
    [20, 74, 60],
    [20, 96, 80],
  ].forEach(([x, y, w]) => g.fillRect(x, y, w, 7));
  return new THREE.CanvasTexture(canvas);
}

function makeLabelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  let label = String(text || '');
  if (label.length > 14) label = `${label.slice(0, 13)}…`;
  g.font = '600 28px "Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(53,224,255,0.9)';
  g.shadowBlur = 10;
  g.fillStyle = 'rgba(228,245,255,0.96)';
  g.fillText(label, 128, 34);
  return new THREE.CanvasTexture(canvas);
}

// Photo-style folder: glossy back panel + tab, a slightly tilted open front
// pocket carrying faint document lines. Root mesh is the raycast target.
function makeFolderNode(color, scale, linesTexture) {
  const backMat = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.5,
    roughness: 0.28,
    metalness: 0.1,
    clearcoat: 0.85,
    clearcoatRoughness: 0.25,
    transparent: true,
    opacity: 0,
  });
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(0.34 * scale, 0.23 * scale, 0.035 * scale),
    backMat,
  );
  const tab = new THREE.Mesh(
    new THREE.BoxGeometry(0.145 * scale, 0.05 * scale, 0.036 * scale),
    backMat,
  );
  tab.position.set(-0.09 * scale, 0.135 * scale, 0);
  const frontMat = backMat.clone();
  frontMat.color = new THREE.Color(color).lerp(new THREE.Color(0xeaf6ff), 0.3);
  frontMat.emissiveIntensity = 0.85;
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(0.34 * scale, 0.18 * scale, 0.028 * scale),
    frontMat,
  );
  front.position.set(0, -0.028 * scale, 0.035 * scale);
  front.rotation.x = -0.22;
  const linesMat = new THREE.MeshBasicMaterial({
    map: linesTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(0.24 * scale, 0.12 * scale), linesMat);
  lines.position.set(0, -0.024 * scale, 0.053 * scale);
  lines.rotation.x = -0.22;
  const rimMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.42),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.34 * scale, 0.18 * scale, 0.028 * scale)),
    rimMaterial,
  );
  rim.position.copy(front.position);
  rim.rotation.copy(front.rotation);
  back.add(tab, front, lines, rim);
  back.userData.mats = [
    { mat: backMat, base: 1 },
    { mat: frontMat, base: 1 },
    { mat: linesMat, base: 0.85 },
    { mat: rimMaterial, base: 0.72 },
  ];
  back.userData.emissives = [
    { mat: backMat, base: 0.5 },
    { mat: frontMat, base: 0.85 },
  ];
  return back;
}

// Photo-style document: white sheet with text lines and a glowing color edge.
function makeDocumentNode(color, scale, linesTexture) {
  const paperMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2f9ff,
    emissive: color,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.05,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
    transparent: true,
    opacity: 0,
  });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.15 * scale, 0.2 * scale, 0.01 * scale),
    paperMat,
  );
  const linesMat = new THREE.MeshBasicMaterial({
    map: linesTexture,
    color: 0x2b4a77,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(0.11 * scale, 0.15 * scale), linesMat);
  lines.position.z = 0.007 * scale;
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.15 * scale, 0.2 * scale, 0.01 * scale)),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    }),
  );
  body.add(lines, edge);
  body.userData.mats = [
    { mat: paperMat, base: 1 },
    { mat: linesMat, base: 0.75 },
    { mat: edge.material, base: 0.9 },
  ];
  body.userData.emissives = [{ mat: paperMat, base: 0.35 }];
  return body;
}

const CALLOUT_SLOTS = [
  { side: 'right', top: '21%' },
  { side: 'left', top: '27%' },
  { side: 'right', top: '49%' },
  { side: 'left', top: '56%' },
];

function smoothStep(value) {
  const bounded = THREE.MathUtils.clamp(value, 0, 1);
  return bounded * bounded * (3 - 2 * bounded);
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
  const { t, language } = useLocale();
  const stageRef = useRef(null);
  const activatorRef = useRef(null);
  const wasExpandedRef = useRef(false);
  const transitionTimerRef = useRef(0);
  const phaseRef = useRef('idle');
  const selectedNodeIdRef = useRef(selectedNode?.id || null);
  const activeGroupIdRef = useRef('');
  const statusFilterRef = useRef(null);
  const liveMetricsRef = useRef({});
  const motionPausedRef = useRef(false);
  const callbacksRef = useRef({});
  const cameraControllerRef = useRef(null);
  const searchQueryRef = useRef('');
  const [phase, setPhase] = useState('idle');
  const [compact, setCompact] = useState(() => window.innerWidth < 760);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [motionPaused, setMotionPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [coreHovered, setCoreHovered] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [webGlState, setWebGlState] = useState('checking');
  const [rendererVersion, setRendererVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetState, setAssetState] = useState('loading');
  const isFullscreen = phase !== 'idle';

  const explorer = useDashboardNodeExplorer({
    rootNodes: nodes,
    selectedNode,
    onNodeSelect,
    onNodeClear,
  });
  const sceneNodes = explorer.sceneNodes;
  const groups = useMemo(() => groupDashboardNodes(sceneNodes), [sceneNodes]);
  const layout = useMemo(
    () => buildGlobeLayout(sceneNodes, { compact, limit: compact ? 36 : 60 }),
    [compact, sceneNodes],
  );
  const visibleNodes = useMemo(() => groups.flatMap((group) => group.nodes), [groups]);
  const renderedLinkCount = useMemo(
    () => groups.reduce((total, group) => total + group.nodes.length + 1, 0),
    [groups],
  );

  // Featured nodes for the photo-style callout cards: the selected node plus
  // the highest-value node of each category, up to the four card slots.
  const calloutNodes = useMemo(() => {
    if (!visibleNodes.length) return [];
    const byValue = [...visibleNodes].sort((a, b) => getNodeValue(b) - getNodeValue(a));
    const seenGroups = new Set();
    const picked = [];
    for (const node of byValue) {
      const groupKey = node.groupId || node.type;
      if (seenGroups.has(groupKey)) continue;
      seenGroups.add(groupKey);
      picked.push(node);
      if (picked.length === CALLOUT_SLOTS.length) break;
    }
    for (const node of byValue) {
      if (picked.length === CALLOUT_SLOTS.length) break;
      if (!picked.includes(node)) picked.push(node);
    }
    if (selectedNode && !picked.some((node) => node.id === selectedNode.id)) {
      const inScene = visibleNodes.find((node) => node.id === selectedNode.id);
      if (inScene) picked.splice(0, 1, inScene);
    }
    return picked.slice(0, CALLOUT_SLOTS.length);
  }, [selectedNode, visibleNodes]);

  const calloutElsRef = useRef(new Map());
  const calloutSvgRef = useRef(null);
  const setCalloutRef = useCallback(
    (id, key) => (el) => {
      const map = calloutElsRef.current;
      const entry = map.get(id) || {};
      if (el) {
        entry[key] = el;
        map.set(id, entry);
      } else {
        delete entry[key];
        if (!entry.card && !entry.line && !entry.dot) map.delete(id);
      }
    },
    [],
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) setMotionPaused(true);
    };
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 760);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!groups.length) {
      setActiveGroupId('');
      return;
    }
    setActiveGroupId((current) =>
      groups.some((group) => group.id === current) ? current : groups[0].id,
    );
  }, [groups]);

  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== 'idle') {
      wasExpandedRef.current = true;
    } else if (wasExpandedRef.current) {
      wasExpandedRef.current = false;
      window.requestAnimationFrame(() => activatorRef.current?.focus());
    }
  }, [phase]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    document.documentElement.classList.add('globe-fullscreen-active');
    return () => document.documentElement.classList.remove('globe-fullscreen-active');
  }, [isFullscreen]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNode?.id || null;
  }, [selectedNode]);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    statusFilterRef.current = statusFilter?.length ? new Set(statusFilter) : null;
  }, [statusFilter]);

  useEffect(() => {
    liveMetricsRef.current = liveMetrics || {};
  }, [liveMetrics]);

  useEffect(() => {
    motionPausedRef.current = motionPaused;
  }, [motionPaused]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const clearTransitionTimer = useCallback(() => {
    window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = 0;
  }, []);

  const handleOpenCore = useCallback(() => {
    if (phaseRef.current === 'open' || phaseRef.current === 'opening') return;
    clearTransitionTimer();
    setPhase(reducedMotion ? 'open' : 'opening');
    if (!reducedMotion) {
      transitionTimerRef.current = window.setTimeout(() => setPhase('open'), TRANSITION_MS);
    }
  }, [clearTransitionTimer, reducedMotion]);

  const handleCloseCore = useCallback(() => {
    if (phaseRef.current === 'idle' || phaseRef.current === 'closing') return;
    clearTransitionTimer();
    onNodeClear?.();
    explorer.resetExplorer();
    setSearchQuery('');
    setHoveredNode(null);
    setPhase(reducedMotion ? 'idle' : 'closing');
    if (!reducedMotion) {
      transitionTimerRef.current = window.setTimeout(() => setPhase('idle'), TRANSITION_MS);
    }
  }, [clearTransitionTimer, explorer, onNodeClear, reducedMotion]);

  useEffect(() => clearTransitionTimer, [clearTransitionTimer]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (selectedNode) onNodeClear?.();
        else if (explorer.canGoBack) explorer.goBack();
        else if (phaseRef.current !== 'idle') handleCloseCore();
        return;
      }
      if (
        phaseRef.current !== 'open' ||
        !visibleNodes.length ||
        !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)
      )
        return;
      event.preventDefault();
      const currentIndex = visibleNodes.findIndex((node) => node.id === selectedNode?.id);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (currentIndex + direction + visibleNodes.length) % visibleNodes.length;
      explorer.selectSceneNode(visibleNodes[nextIndex]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [explorer, handleCloseCore, onNodeClear, selectedNode, visibleNodes]);

  callbacksRef.current = {
    openCore: handleOpenCore,
    clearNode: onNodeClear,
    selectNode: explorer.selectSceneNode,
    selectGroup: setActiveGroupId,
    enterFolder: explorer.enterFolder,
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    if (!layout.length) {
      stage.replaceChildren();
      setWebGlState(loading ? 'checking' : 'empty');
      return undefined;
    }
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !compact,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (_) {
      setWebGlState('failed');
      stage.replaceChildren();
      return undefined;
    }

    setWebGlState('ready');
    stage.replaceChildren(renderer.domElement);
    renderer.domElement.className = 'globe-webgl-canvas';
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.6));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 60);
    camera.position.set(0, 0.1, 6.25);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(4, 4);
    let animationFrame = 0;
    let openProgress = phaseRef.current === 'open' ? 1 : 0;
    let hoveredObject = null;
    let disposed = false;
    let pointerDown = null;
    let lastFocusedId = null;
    let lastFrameTime = 0;

    const cameraController = new GlobeCameraController(camera, renderer.domElement, {
      compact,
      reducedMotion,
    });
    cameraControllerRef.current = cameraController;
    // Seed the diagnostics attributes before the first (shader-compiling,
    // therefore slow) frame so external readers never observe missing values.
    renderer.domElement.dataset.cameraDistance = camera.position
      .distanceTo(cameraController.controls.target)
      .toFixed(3);
    renderer.domElement.dataset.focusedNode = '';

    // Demo-style lighting: cool ambient, pale key light and a cyan core light.
    scene.add(new THREE.AmbientLight(0x24406b, 1.2));
    const keyLight = new THREE.DirectionalLight(0x9fd4ff, 0.8);
    keyLight.position.set(5, 8, 3);
    scene.add(keyLight);
    const coreLight = new THREE.PointLight(0x35e0ff, 1.5, 15);
    coreLight.position.set(0, 0.475, 0);
    scene.add(coreLight);

    const spaceEnvironment = createSpaceEnvironment({ compact });
    scene.add(spaceEnvironment.group);

    const glowTexture = makeGlowTexture();
    const makeGlow = (color, scale, opacity) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.scale.set(scale, scale, 1);
      return sprite;
    };

    const backGlow = makeGlow(0x1e6fd0, 7.5, 0.16);
    scene.add(backGlow);

    // Everything inside globeGroup slowly spins together like the demo world.
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // ---- Holographic shells ------------------------------------------------
    const shellW = compact ? 64 : 96;
    const shellH = compact ? 32 : 48;
    const topMat = makeHoloMaterial();
    const botMat = makeHoloMaterial();
    const holoMats = [topMat, botMat];
    const topShell = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, shellW, shellH, 0, Math.PI * 2, 0, Math.PI * 0.46),
      topMat,
    );
    const botShell = new THREE.Mesh(
      new THREE.SphereGeometry(
        GLOBE_RADIUS,
        shellW,
        shellH,
        0,
        Math.PI * 2,
        Math.PI * 0.54,
        Math.PI * 0.46,
      ),
      botMat,
    );
    globeGroup.add(topShell, botShell);

    // Invisible collider keeps a stable click/hover target for the core.
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, compact ? 40 : 56, compact ? 24 : 36),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    globe.userData.kind = 'core';
    globeGroup.add(globe);

    // ---- Orbit rings -------------------------------------------------------
    const ringGroupA = new THREE.Group();
    ringGroupA.rotation.z = 0.2;
    ringGroupA.add(makeRing(2.175, 0x35e0ff, 0.75));
    const ringGroupB = new THREE.Group();
    ringGroupB.rotation.z = -0.16;
    ringGroupB.rotation.x = 0.1;
    ringGroupB.add(makeRing(2.4, 0x8e5bff, 0.6));
    globeGroup.add(ringGroupA, ringGroupB);

    // ---- Circuit board discs ----------------------------------------------
    const circuitTexture = makeCircuitTexture(compact);
    // Five decks, wider toward the bottom like the reference art. Each deck is
    // a group carrying its disc, nodes, pads, labels and lines so the whole
    // stack can compress inside the sealed sphere and fan out when opened.
    const discDefs = [
      { r: 1.52, yOpen: -1.15, yClosed: -0.42 },
      { r: 1.4, yOpen: -0.84, yClosed: -0.3 },
      { r: 1.275, yOpen: -0.525, yClosed: -0.19 },
      { r: 0.975, yOpen: -0.15, yClosed: -0.05 },
      { r: 0.7, yOpen: 0.225, yClosed: 0.1 },
    ];
    const discRecords = [];
    const discGroups = discDefs.map((def) => {
      const discGroup = new THREE.Group();
      discGroup.position.y = def.yClosed;
      globeGroup.add(discGroup);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(def.r, def.r, 0.035, compact ? 48 : 72),
        new THREE.MeshStandardMaterial({
          map: circuitTexture,
          emissiveMap: circuitTexture,
          color: 0x223a66,
          emissive: 0x9fd4ff,
          emissiveIntensity: 0.55,
          roughness: 0.6,
          metalness: 0.25,
          transparent: true,
          opacity: 0,
        }),
      );
      discGroup.add(disc);
      const rim = makeRing(def.r + 0.01, 0x35e0ff, 0);
      discGroup.add(rim);
      const underGlow = makeGlow(0x2f7fd0, def.r * 2.6, 0);
      underGlow.position.y = -0.03;
      discGroup.add(underGlow);
      discRecords.push({
        disc,
        rim,
        underGlow,
        group: discGroup,
        yOpen: def.yOpen,
        yClosed: def.yClosed,
      });
      return discGroup;
    });

    // ---- Core cube + light beam -------------------------------------------
    const coreGroup = new THREE.Group();
    coreGroup.position.y = 0.475;
    globeGroup.add(coreGroup);
    const coreBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.96 }),
    );
    coreBox.userData.kind = 'core';
    const coreWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.31, 0.31, 0.31)),
      new THREE.LineBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.9 }),
    );
    const coreGlow = makeGlow(0xbdf2ff, 0.85, 0.85);
    const coreHalo = makeGlow(0x35a0ff, 1.8, 0.35);
    coreGroup.add(coreBox, coreWire, coreGlow, coreHalo);

    const beamMaterial = makeBeamMaterial();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 4.3, compact ? 32 : 48, 1, true),
      beamMaterial,
    );
    beam.position.y = -0.2;
    globeGroup.add(beam);

    // ---- Pedestal ----------------------------------------------------------
    const pedestal = new THREE.Group();
    pedestal.position.y = -1.95;
    globeGroup.add(pedestal);
    const pedestalLower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.175, 1.35, 0.16, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0a132b,
        roughness: 0.5,
        metalness: 0.6,
        emissive: 0x0d2246,
        emissiveIntensity: 0.4,
      }),
    );
    const pedestalUpper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.775, 0.925, 0.13, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0c1834,
        roughness: 0.5,
        metalness: 0.6,
        emissive: 0x123061,
        emissiveIntensity: 0.5,
      }),
    );
    pedestalUpper.position.y = 0.14;
    pedestal.add(pedestalLower, pedestalUpper);
    const pedestalRings = [];
    [
      [0.575, 0x35e0ff],
      [0.9, 0x8e5bff],
      [1.225, 0x35e0ff],
    ].forEach(([radius, color], index) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + 0.025, 96),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.225 + index * 0.001;
      pedestal.add(ring);
      pedestalRings.push(ring);
    });
    const pedestalGlow = makeGlow(0x2f9fe0, 3.2, 0.22);
    pedestalGlow.position.y = 0.2;
    pedestal.add(pedestalGlow);

    setAssetState('loading');
    loadDashboardAssetKit()
      .then((assetKit) => {
        if (disposed) {
          assetKit.traverse((object) => {
            object.geometry?.dispose?.();
            object.material?.dispose?.();
          });
          return;
        }
        // The GLB kit doubles as extra pedestal machinery under the hologram.
        assetKit.scale.setScalar(0.62);
        assetKit.position.y = 0.34;
        assetKit.traverse((object) => {
          if (object.isMesh && object.material) {
            object.material.transparent = true;
            object.material.opacity = 0.5;
          }
        });
        pedestal.add(assetKit);
        setAssetState('loaded');
      })
      .catch(() => {
        if (!disposed) setAssetState('fallback');
      });

    // ---- Data nodes on the discs -------------------------------------------
    const nodeMeshes = [];
    const nodeRecords = [];
    const pulses = [];
    const docLinesTexture = makeDocLinesTexture();
    const ownedTextures = [docLinesTexture];
    const maxValue = Math.max(1, ...visibleNodes.map(getNodeValue));

    // Spread groups across the decks, keeping runs of the same group together
    // and balancing load by ring circumference so wide decks carry more.
    // Oversized groups (e.g. an explored folder) are chunked over several decks.
    const MAX_CHUNK = 14;
    const groupChunks = [];
    layout.forEach((group, groupIndex) => {
      const entries = group.positionedNodes.map((positioned) => ({
        node: positioned.node,
        group,
        groupIndex,
      }));
      for (let start = 0; start < entries.length; start += MAX_CHUNK) {
        groupChunks.push(entries.slice(start, start + MAX_CHUNK));
      }
    });
    const discBuckets = discDefs.map(() => []);
    groupChunks.forEach((chunk) => {
      let best = 0;
      let bestRatio = Infinity;
      discBuckets.forEach((bucket, index) => {
        const ratio = bucket.length / discDefs[index].r;
        if (ratio < bestRatio - 1e-6) {
          bestRatio = ratio;
          best = index;
        }
      });
      discBuckets[best].push(...chunk);
    });

    discBuckets.forEach((bucket, discIndex) => {
      const def = discDefs[discIndex];
      const discGroup = discGroups[discIndex];
      bucket.forEach((entry, index) => {
        const angle = (index / Math.max(1, bucket.length)) * Math.PI * 2 + discIndex * 0.5;
        const ringRadius = def.r * 0.86;
        const groupColor = new THREE.Color(entry.group.color);
        const valueScale = Math.sqrt(getNodeValue(entry.node) / maxValue);
        const sizeScale = 1.08 + valueScale * 0.72;
        const isFolderNode = entry.node.kind === 'folder' || entry.node.meta?.folder === true;
        const mesh = isFolderNode
          ? makeFolderNode(groupColor, sizeScale, docLinesTexture)
          : makeDocumentNode(groupColor, sizeScale, docLinesTexture);
        const nodeX = Math.sin(angle) * ringRadius;
        const nodeZ = Math.cos(angle) * ringRadius;
        mesh.position.set(nodeX, 0.17, nodeZ);
        // Keep folder/document faces readable like the reference HUD instead
        // of turning edge-on as they travel around a circular deck.
        mesh.rotation.set(-0.04, 0, 0);
        mesh.userData.kind = 'node';
        mesh.userData.node = entry.node;
        mesh.userData.groupId = entry.group.id;
        discGroup.add(mesh);
        nodeMeshes.push(mesh);

        const statusColor = STATUS_COLORS[entry.node.status] || entry.group.color;
        const halo = makeGlow(statusColor, 0.38 * sizeScale, 0);
        halo.position.z = 0.03;
        mesh.add(halo);

        // Landing pad + glowing rim under each node, like the reference image.
        const platform = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1 * sizeScale, 0.115 * sizeScale, 0.016, 28),
          new THREE.MeshStandardMaterial({
            color: 0x0a1a38,
            emissive: 0x14336b,
            emissiveIntensity: 0.7,
            roughness: 0.45,
            metalness: 0.5,
            transparent: true,
            opacity: 0,
          }),
        );
        platform.position.set(nodeX, 0.028, nodeZ);
        const padRing = new THREE.Mesh(
          new THREE.RingGeometry(0.105 * sizeScale, 0.122 * sizeScale, 36),
          new THREE.MeshBasicMaterial({
            color: groupColor,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        padRing.rotation.x = -Math.PI / 2;
        padRing.position.set(nodeX, 0.038, nodeZ);
        discGroup.add(platform, padRing);

        // Floating name label so nodes are identifiable at a glance.
        const labelTexture = makeLabelTexture(entry.node.label);
        ownedTextures.push(labelTexture);
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        label.scale.set(0.36, 0.09, 1);
        label.position.set(nodeX, 0.18 + 0.15 * sizeScale, nodeZ);
        discGroup.add(label);

        // Node → inner ring → disc centre connection, demo style (deck-local).
        const A = mesh.position.clone().add(new THREE.Vector3(0, -0.085, 0));
        const B = new THREE.Vector3(
          Math.sin(angle) * ringRadius * 0.35,
          0.025,
          Math.cos(angle) * ringRadius * 0.35,
        );
        const C = new THREE.Vector3(0, 0.025, 0);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: groupColor,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([A, B, C]),
          lineMaterial,
        );
        discGroup.add(line);

        nodeRecords.push({
          mesh,
          halo,
          lineMaterial,
          mats: [
            ...mesh.userData.mats,
            { mat: platform.material, base: 1 },
            { mat: padRing.material, base: 0.85 },
            { mat: label.material, base: 0.95 },
          ],
          emissives: mesh.userData.emissives,
          node: entry.node,
          groupId: entry.group.id,
          discGroup,
          order: nodeRecords.length,
          conn: { A, B, C, L1: A.distanceTo(B), L2: B.distanceTo(C) },
          color: groupColor,
        });
      });
    });
    const recordById = new Map(nodeRecords.map((record) => [record.node.id, record]));

    // ---- In-place circuit-style folder expansion ----------------------------
    // Clicking a folder node fans its real children out on the deck, wired to
    // the parent with PCB-style bus + arc traces and junction dots.
    const expansion = {
      token: 0,
      parentId: null,
      group: null,
      meshes: [],
      records: [],
      lineMats: [],
      glowMats: [],
      pulses: [],
      textures: [],
      openedAt: 0,
    };
    const collapseExpansion = () => {
      expansion.token += 1;
      if (expansion.group) {
        expansion.group.parent?.remove(expansion.group);
        expansion.group.traverse((child) => {
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
          else child.material?.dispose?.();
        });
      }
      expansion.textures.forEach((texture) => texture.dispose());
      expansion.group = null;
      expansion.parentId = null;
      expansion.meshes = [];
      expansion.records = [];
      expansion.lineMats = [];
      expansion.glowMats = [];
      expansion.pulses = [];
      expansion.textures = [];
    };

    const pulseAlong = new THREE.Vector3();
    const pointAlongPath = (points, cumulative, total, t) => {
      const target = t * total;
      let index = 1;
      while (index < cumulative.length - 1 && cumulative[index] < target) index += 1;
      const segStart = cumulative[index - 1];
      const segLength = cumulative[index] - segStart || 1;
      return pulseAlong
        .copy(points[index - 1])
        .lerp(points[index], (target - segStart) / segLength);
    };

    const buildExpansion = (parentRecord, browseResult) => {
      const children = [
        ...(browseResult.folders || []).map((item) => ({ ...item, isFolder: true })),
        ...(browseResult.files || []).map((item) => ({ ...item, isFolder: false })),
      ];
      if (!children.length) return;
      const maxChildren = compact ? 8 : 14;
      const shown = children.slice(0, maxChildren);
      const hiddenCount = children.length - shown.length;

      const group = new THREE.Group();
      parentRecord.discGroup.add(group);
      expansion.group = group;
      expansion.parentId = parentRecord.node.id;
      expansion.openedAt = performance.now() * 0.001;

      const parentPos = parentRecord.mesh.position;
      const parentAngle = Math.atan2(parentPos.x, parentPos.z);
      const parentRadius = Math.hypot(parentPos.x, parentPos.z);
      const ringOne = Math.max(0.24, parentRadius - 0.34);
      const ringTwo = Math.max(0.18, parentRadius - 0.6);
      const ringOneCount = Math.min(shown.length, 7);
      const color = parentRecord.color;

      const addTrace = (childAngle, ringR) => {
        const points = [];
        const startR = Math.max(ringR + 0.13, parentRadius - 0.1);
        points.push(
          new THREE.Vector3(Math.sin(parentAngle) * startR, 0.05, Math.cos(parentAngle) * startR),
        );
        const busR = ringR + 0.12;
        points.push(
          new THREE.Vector3(Math.sin(parentAngle) * busR, 0.05, Math.cos(parentAngle) * busR),
        );
        const sweep = childAngle - parentAngle;
        const steps = Math.max(2, Math.ceil(Math.abs(sweep) / 0.07));
        for (let step = 1; step <= steps; step += 1) {
          const a = parentAngle + (sweep * step) / steps;
          points.push(new THREE.Vector3(Math.sin(a) * busR, 0.05, Math.cos(a) * busR));
        }
        points.push(
          new THREE.Vector3(Math.sin(childAngle) * ringR, 0.05, Math.cos(childAngle) * ringR),
        );
        const lineMaterial = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
        expansion.lineMats.push(lineMaterial);
        // PCB junction dots at the two right-angle corners.
        [points[1], points[points.length - 2]].forEach((corner) => {
          const dot = makeGlow(color, 0.05, 0);
          dot.position.copy(corner);
          group.add(dot);
          expansion.glowMats.push(dot.material);
        });
        const cumulative = [0];
        for (let index = 1; index < points.length; index += 1) {
          cumulative.push(cumulative[index - 1] + points[index - 1].distanceTo(points[index]));
        }
        return { points, cumulative, total: cumulative[cumulative.length - 1] };
      };

      shown.forEach((child, index) => {
        const onRingOne = index < ringOneCount;
        const ringR = onRingOne ? ringOne : ringTwo;
        const ringIndex = onRingOne ? index : index - ringOneCount;
        const ringCount = onRingOne ? ringOneCount : shown.length - ringOneCount;
        const spacing = Math.min(0.4 / ringR, (Math.PI * 1.6) / Math.max(1, ringCount));
        const childAngle = parentAngle + (ringIndex - (ringCount - 1) / 2) * spacing;
        const childX = Math.sin(childAngle) * ringR;
        const childZ = Math.cos(childAngle) * ringR;

        const mesh = child.isFolder
          ? makeFolderNode(color, 0.76, docLinesTexture)
          : makeDocumentNode(color, 0.7, docLinesTexture);
        mesh.position.set(childX, 0.1, childZ);
        mesh.rotation.set(-0.04, 0, 0);
        mesh.scale.setScalar(0.001);
        mesh.userData.kind = 'child';
        mesh.userData.child = child;
        group.add(mesh);
        expansion.meshes.push(mesh);

        const padRing = new THREE.Mesh(
          new THREE.RingGeometry(0.055, 0.066, 24),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        padRing.rotation.x = -Math.PI / 2;
        padRing.position.set(childX, 0.024, childZ);
        group.add(padRing);

        const labelTexture = makeLabelTexture(child.name);
        expansion.textures.push(labelTexture);
        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        label.scale.set(0.26, 0.065, 1);
        label.position.set(childX, 0.245, childZ);
        group.add(label);

        const trace = addTrace(childAngle, ringR);
        expansion.records.push({
          mesh,
          mats: [
            ...mesh.userData.mats,
            { mat: padRing.material, base: 0.8 },
            { mat: label.material, base: 0.95 },
          ],
          emissives: mesh.userData.emissives,
          trace,
        });
      });

      if (hiddenCount > 0) {
        const moreTexture = makeLabelTexture(`+${hiddenCount}`);
        expansion.textures.push(moreTexture);
        const more = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: moreTexture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        more.scale.set(0.2, 0.05, 1);
        more.position.set(Math.sin(parentAngle) * ringTwo, 0.3, Math.cos(parentAngle) * ringTwo);
        group.add(more);
        expansion.glowMats.push(more.material);
      }

      const pulseTotal = Math.min(compact ? 4 : 8, expansion.records.length);
      for (let index = 0; index < pulseTotal; index += 1) {
        const record = expansion.records[(Math.random() * expansion.records.length) | 0];
        const sprite = makeGlow(color, 0.06, 0.9);
        group.add(sprite);
        expansion.pulses.push({
          sprite,
          trace: record.trace,
          t: Math.random(),
          speed: 0.35 + Math.random() * 0.4,
        });
      }
    };

    const expandFolder = async (record) => {
      if (!window.api?.browseDashboardNode) return;
      if (expansion.parentId === record.node.id) {
        collapseExpansion();
        return;
      }
      collapseExpansion();
      const token = expansion.token;
      let result;
      try {
        result = await window.api.browseDashboardNode({ nodeId: record.node.id });
      } catch (_) {
        return;
      }
      if (disposed || token !== expansion.token || !result?.ok) return;
      buildExpansion(record, result);
    };

    const pulseCount = Math.min(compact ? 8 : 20, nodeRecords.length * 2);
    for (let index = 0; index < pulseCount && nodeRecords.length; index += 1) {
      const record = nodeRecords[(Math.random() * nodeRecords.length) | 0];
      const sprite = makeGlow(record.color, 0.08, 0.95);
      record.discGroup.add(sprite);
      pulses.push({ sprite, record, t: Math.random(), speed: 0.25 + Math.random() * 0.4 });
    }
    const pulseTarget = new THREE.Vector3();
    const positionPulse = (record, t) => {
      const { A, B, C, L1, L2 } = record.conn;
      const distance = t * (L1 + L2);
      if (distance < L1) pulseTarget.copy(A).lerp(B, L1 ? distance / L1 : 1);
      else pulseTarget.copy(B).lerp(C, L2 ? (distance - L1) / L2 : 1);
      return pulseTarget;
    };

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(280, rect.width);
      const height = Math.max(400, rect.height);
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 620 ? 1.25 : 1.6));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const setPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    // When open, the sealed-sphere collider must not shadow nodes inside the
    // globe radius — interactions target real meshes only; empty space clears.
    const rayTargets = () =>
      openProgress > 0.55 ? [...nodeMeshes, ...expansion.meshes] : [globe];

    const updateHover = (event) => {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const next = raycaster.intersectObjects(rayTargets(), false)[0]?.object || null;
      if (next === hoveredObject) return;
      hoveredObject = next;
      const child = next?.userData?.kind === 'child' ? next.userData.child : null;
      const node = child
        ? {
            label: child.name,
            type: child.isFolder ? 'folder' : child.ext || 'file',
            path: child.path,
          }
        : next?.userData?.node || null;
      setHoveredNode(node);
      setCoreHovered(next?.userData?.kind === 'core');
      stage.style.cursor = next ? 'pointer' : 'default';
    };

    const clearHover = () => {
      hoveredObject = null;
      setHoveredNode(null);
      setCoreHovered(false);
      stage.style.cursor = 'default';
    };

    const handleClick = (event) => {
      if (
        pointerDown &&
        Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6
      )
        return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(rayTargets(), false)[0]?.object;
      if (!hit) {
        if (openProgress > 0.55) {
          collapseExpansion();
          callbacksRef.current.clearNode?.();
        }
        return;
      }
      if (hit.userData.kind === 'core') {
        if (phaseRef.current === 'idle' || phaseRef.current === 'closing')
          callbacksRef.current.openCore?.();
        else {
          collapseExpansion();
          callbacksRef.current.clearNode?.();
        }
      } else if (hit.userData.kind === 'node') {
        callbacksRef.current.selectGroup?.(hit.userData.groupId);
        callbacksRef.current.selectNode?.(hit.userData.node);
        const record = recordById.get(hit.userData.node?.id);
        const isFolderKind =
          hit.userData.node?.kind === 'folder' || hit.userData.node?.meta?.folder === true;
        if (record && isFolderKind) expandFolder(record);
        else collapseExpansion();
      } else if (hit.userData.kind === 'child') {
        const child = hit.userData.child;
        if (child.isFolder) {
          // Dive into the subfolder: re-root the whole deck view on it.
          collapseExpansion();
          callbacksRef.current.enterFolder?.({
            id: child.id,
            label: child.name,
            path: child.path,
            type: 'file',
            kind: 'folder',
            value: Math.max(1, Number(child.itemCount || 1)),
            status: 'normal',
            meta: { folder: true, itemCount: child.itemCount },
          });
        } else {
          window.api?.revealDashboardNode?.({ nodeId: child.id });
        }
      }
    };

    const handlePointerDown = (event) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = () => {
      window.setTimeout(() => {
        pointerDown = null;
      }, 0);
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      setWebGlState('failed');
    };

    renderer.domElement.addEventListener('pointermove', updateHover);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', clearHover);
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const worldPosition = new THREE.Vector3();
    const animate = (time) => {
      if (disposed) return;
      animationFrame = window.requestAnimationFrame(animate);
      if (document.hidden) return;

      const seconds = time * 0.001;
      const dt = Math.min(0.05, lastFrameTime ? (time - lastFrameTime) * 0.001 : 0.016);
      lastFrameTime = time;
      const shouldOpen = phaseRef.current === 'opening' || phaseRef.current === 'open';
      const targetProgress = shouldOpen ? 1 : 0;
      openProgress = reducedMotion
        ? targetProgress
        : THREE.MathUtils.lerp(openProgress, targetProgress, 0.075);
      const progress = smoothStep(openProgress);
      const isPaused = motionPausedRef.current || reducedMotion;
      const selectedId = selectedNodeIdRef.current;
      cameraController.setOpenProgress(progress);

      const globeScale = THREE.MathUtils.lerp(0.98, compact ? 0.94 : 1.06, progress);
      globeGroup.scale.setScalar(globeScale);
      // Closed: a nearly complete hologram sphere. Open: the shells float
      // apart like the demo, exposing the circuit decks and data nodes.
      const bob = isPaused ? 0 : Math.sin(seconds * 0.6) * 0.018 * progress;
      const shellGap = THREE.MathUtils.lerp(0.035, 0.72, progress) + bob;
      topShell.position.y = shellGap;
      botShell.position.y = -shellGap;
      holoMats.forEach((material) => {
        material.uniforms.uTime.value = seconds;
        material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.85, 1, progress);
      });

      if (!isPaused && !selectedId) {
        globeGroup.rotation.y += dt * THREE.MathUtils.lerp(0.09, 0.03, progress);
      }
      if (!isPaused) {
        ringGroupA.rotation.y += dt * 0.12;
        ringGroupB.rotation.y -= dt * 0.09;
        coreBox.rotation.y += dt * 0.5;
        coreBox.rotation.x += dt * 0.22;
        coreWire.rotation.y -= dt * 0.3;
        coreWire.rotation.x -= dt * 0.14;
      }

      const metrics = liveMetricsRef.current || {};
      const cpu = THREE.MathUtils.clamp(Number(metrics.cpuPercent) / 100 || 0, 0, 1);
      coreLight.intensity = 1.3 + cpu * 1.2;
      coreGlow.material.opacity = isPaused ? 0.8 : 0.72 + Math.sin(seconds * 1.7) * 0.12;
      coreHalo.material.opacity = 0.28 + cpu * 0.2;
      beamMaterial.uniforms.uTime.value = seconds;
      beamMaterial.uniforms.uOpen.value = THREE.MathUtils.lerp(0.35, 1, progress);
      pedestalRings.forEach((ring, index) => {
        ring.material.opacity = isPaused ? 0.6 : 0.45 + 0.3 * Math.sin(seconds * 1.6 + index * 1.3);
      });
      discRecords.forEach((record) => {
        // Fan the deck stack out from its compressed closed position.
        record.group.position.y = THREE.MathUtils.lerp(record.yClosed, record.yOpen, progress);
        record.disc.material.opacity = THREE.MathUtils.lerp(0.25, 0.96, progress);
        record.rim.material.opacity = THREE.MathUtils.lerp(0.18, 0.8, progress);
        record.underGlow.material.opacity = THREE.MathUtils.lerp(0.03, 0.1, progress);
      });
      spaceEnvironment.update(seconds, isPaused);

      if (selectedId !== lastFocusedId) {
        lastFocusedId = selectedId;
        const selectedRecord = nodeRecords.find((record) => record.node.id === selectedId);
        if (selectedRecord) {
          selectedRecord.mesh.getWorldPosition(worldPosition);
          cameraController.focusNode(selectedId, worldPosition);
        } else if (!selectedId) {
          cameraController.reset(progress > 0.5);
        }
      }

      const filter = statusFilterRef.current;
      const query = searchQueryRef.current;
      nodeRecords.forEach((record) => {
        const stagger = smoothStep(openProgress * 1.22 - record.order * 0.008);
        const isSelected = selectedId === record.node.id;
        const isHovered = hoveredObject === record.mesh;
        const isActiveGroup = record.groupId === activeGroupIdRef.current;
        const searchMismatch = Boolean(query && scoreDashboardNode(record.node, query) <= 0);
        const filteredOut = Boolean(
          ((filter && !filter.has(record.node.status)) || searchMismatch) && !isSelected,
        );
        const reveal = THREE.MathUtils.lerp(0.4, 1, stagger);
        record.mesh.scale.setScalar(reveal * (isSelected ? 1.55 : isHovered ? 1.3 : 1));
        const nodeOpacity = filteredOut
          ? progress * 0.08
          : THREE.MathUtils.lerp(0.35, isActiveGroup ? 1 : 0.78, progress);
        record.mats.forEach(({ mat, base }) => {
          mat.opacity = nodeOpacity * base;
        });
        const emissiveBoost = isSelected ? 2.8 : isHovered ? 2.1 : 1;
        record.emissives.forEach(({ mat, base }) => {
          mat.emissiveIntensity = base * emissiveBoost;
        });
        record.halo.material.opacity = filteredOut
          ? 0.02
          : THREE.MathUtils.lerp(0.12, isSelected ? 0.95 : isHovered ? 0.7 : 0.4, progress);
        record.lineMaterial.opacity = filteredOut
          ? 0.02
          : THREE.MathUtils.lerp(0.1, isActiveGroup ? 0.5 : 0.24, progress);
      });

      if (!isPaused) {
        pulses.forEach((pulse) => {
          pulse.t += dt * pulse.speed;
          if (pulse.t >= 1) {
            pulse.t = 0;
            pulse.record = nodeRecords[(Math.random() * nodeRecords.length) | 0];
            pulse.sprite.material.color.copy(pulse.record.color);
            // Connections are deck-local, so pulses ride the new node's deck.
            pulse.record.discGroup.add(pulse.sprite);
          }
          pulse.sprite.position.copy(positionPulse(pulse.record, pulse.t));
          pulse.sprite.material.opacity = THREE.MathUtils.lerp(0.2, 0.95, progress);
        });
      }

      // Drive the circuit-style folder expansion (staggered reveal + pulses).
      if (expansion.records.length) {
        const openAge = seconds - expansion.openedAt;
        expansion.records.forEach((record, index) => {
          const reveal = smoothStep(Math.min(1, openAge * 2.6 - index * 0.06));
          const isHovered = hoveredObject === record.mesh;
          record.mesh.scale.setScalar(Math.max(0.001, reveal * (isHovered ? 1.25 : 1)));
          record.mats.forEach(({ mat, base }) => {
            mat.opacity = reveal * base * progress;
          });
          record.emissives.forEach(({ mat, base }) => {
            mat.emissiveIntensity = base * (isHovered ? 2.2 : 1.1);
          });
        });
        expansion.lineMats.forEach((material, index) => {
          material.opacity = Math.max(0, Math.min(0.6, openAge * 1.8 - index * 0.04)) * progress;
        });
        expansion.glowMats.forEach((material) => {
          material.opacity = Math.min(0.85, Math.max(0, openAge * 2)) * progress;
        });
        if (!isPaused) {
          expansion.pulses.forEach((pulse) => {
            pulse.t += dt * pulse.speed;
            if (pulse.t >= 1) {
              pulse.t = 0;
              pulse.trace = expansion.records[(Math.random() * expansion.records.length) | 0].trace;
            }
            pulse.sprite.position.copy(
              pointAlongPath(
                pulse.trace.points,
                pulse.trace.cumulative,
                pulse.trace.total,
                pulse.t,
              ),
            );
          });
        }
      }

      cameraController.update();
      renderer.render(scene, camera);

      // Project callout lead lines onto the HUD layer (photo-style cards).
      const calloutEls = calloutElsRef.current;
      if (calloutEls.size) {
        const section = stage.closest('section') || stage.parentElement;
        const sectionRect = section.getBoundingClientRect();
        const canvasRect = renderer.domElement.getBoundingClientRect();
        const svg = calloutSvgRef.current;
        if (svg) {
          svg.setAttribute('width', Math.round(sectionRect.width));
          svg.setAttribute('height', Math.round(sectionRect.height));
        }
        calloutEls.forEach((els, id) => {
          if (!els.line) return;
          const record = recordById.get(id);
          const visible =
            record && els.card && els.card.offsetParent !== null && openProgress > 0.55;
          if (visible) {
            record.mesh.getWorldPosition(worldPosition);
            worldPosition.y += 0.16;
            worldPosition.project(camera);
          }
          if (!visible || worldPosition.z > 1) {
            els.line.setAttribute('points', '');
            els.dot?.setAttribute('r', '0');
            return;
          }
          const nx =
            canvasRect.left - sectionRect.left + (worldPosition.x * 0.5 + 0.5) * canvasRect.width;
          const ny =
            canvasRect.top - sectionRect.top + (-worldPosition.y * 0.5 + 0.5) * canvasRect.height;
          const cardRect = els.card.getBoundingClientRect();
          const side = els.card.dataset.side;
          const ax = (side === 'left' ? cardRect.right : cardRect.left) - sectionRect.left;
          const ay = cardRect.top + cardRect.height / 2 - sectionRect.top;
          const ex = side === 'left' ? ax + 36 : ax - 36;
          els.line.setAttribute('points', `${ax},${ay} ${ex},${ay} ${nx},${ny}`);
          if (els.dot) {
            els.dot.setAttribute('cx', nx);
            els.dot.setAttribute('cy', ny);
            els.dot.setAttribute('r', '3');
          }
        });
      }

      renderer.domElement.dataset.cameraDistance = camera.position
        .distanceTo(cameraController.controls.target)
        .toFixed(3);
      renderer.domElement.dataset.focusedNode = selectedId || '';
      renderer.domElement.dataset.expansionCount = String(expansion.records.length);
      renderer.domElement.dataset.expansionParent = expansion.parentId || '';
      renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
      renderer.domElement.dataset.triangles = String(renderer.info.render.triangles);
      renderer.domElement.dataset.pixelRatio = renderer.getPixelRatio().toFixed(2);
    };
    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      collapseExpansion();
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', updateHover);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', clearHover);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      scene.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material))
          object.material.forEach((material) => material.dispose());
        else object.material?.dispose();
      });
      glowTexture.dispose();
      circuitTexture.dispose();
      ownedTextures.forEach((texture) => texture.dispose());
      cameraController.dispose();
      cameraControllerRef.current = null;
      renderer.renderLists.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === stage) stage.removeChild(renderer.domElement);
      window.setTimeout(() => renderer.forceContextLoss(), 50);
    };
  }, [compact, isFullscreen, layout, loading, reducedMotion, rendererVersion, visibleNodes]);

  const stateAnnouncement =
    phase === 'idle'
      ? t('dashboard.coreIdleState')
      : phase === 'opening'
        ? t('dashboard.coreOpeningState')
        : phase === 'closing'
          ? t('dashboard.coreClosingState')
          : t('dashboard.coreOpenState');

  const globeContent = (
    <section
      className={`dashboard-globe-card glass-card hologram-globe-card globe-state-${phase}${isFullscreen ? ' globe-fullscreen' : ''}`}
      data-testid="dashboard-data-core"
      data-state={phase}
      data-fullscreen={isFullscreen ? 'true' : 'false'}
      data-node-count={visibleNodes.length}
      data-asset-state={assetState}
    >
      <div className="globe-scanline" aria-hidden="true" />
      <header className="globe-core-header">
        <span>{t('dashboard.coreEyebrow')}</span>
        <strong>{t('dashboard.coreTitle')}</strong>
        <em>{stateAnnouncement}</em>
      </header>

      <div ref={stageRef} className="globe-stage" aria-hidden="true" />

      {phase === 'idle' && groups.length ? (
        <button
          ref={activatorRef}
          type="button"
          className={`globe-core-activator${coreHovered ? ' is-hovered' : ''}`}
          onClick={handleOpenCore}
          onMouseEnter={() => setCoreHovered(true)}
          onMouseLeave={() => setCoreHovered(false)}
          aria-expanded="false"
          aria-controls="globe-data-directory"
        >
          <span className="core-activator-reticle" aria-hidden="true" />
          <strong>{t('dashboard.coreOpen')}</strong>
          <span>{t('dashboard.coreOpenHint')}</span>
          <em>
            {visibleNodes.length} {t('dashboard.liveNodes')}
          </em>
        </button>
      ) : null}

      {phase !== 'idle' ? (
        <div className="globe-core-controls">
          {explorer.canGoBack ? (
            <button type="button" onClick={explorer.goBack}>
              {t('dashboard.coreBack')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onNodeClear?.();
              cameraControllerRef.current?.reset(true);
            }}
          >
            {t('dashboard.coreResetView')}
          </button>
          <button
            type="button"
            onClick={() => setMotionPaused((current) => !current)}
            aria-pressed={motionPaused}
          >
            {motionPaused ? t('dashboard.coreResumeMotion') : t('dashboard.corePauseMotion')}
          </button>
          <button type="button" className="core-close-button" onClick={handleCloseCore}>
            {t('dashboard.coreClose')}
          </button>
        </div>
      ) : null}

      {phase === 'open' && webGlState === 'ready' && calloutNodes.length ? (
        <div className="globe-callout-layer">
          <svg ref={calloutSvgRef} className="globe-callout-leads" aria-hidden="true">
            {calloutNodes.map((node) => (
              <g key={node.id}>
                <polyline ref={setCalloutRef(node.id, 'line')} points="" />
                <circle ref={setCalloutRef(node.id, 'dot')} r="0" />
              </g>
            ))}
          </svg>
          {calloutNodes.map((node, index) => {
            const slot = CALLOUT_SLOTS[index];
            const metaParts = [node.type];
            if (node.sizeBytes) metaParts.push(formatBytes(node.sizeBytes));
            if (node.count) metaParts.push(`×${node.count}`);
            return (
              <button
                type="button"
                key={node.id}
                ref={setCalloutRef(node.id, 'card')}
                className="globe-callout"
                data-side={slot.side}
                data-selected={selectedNode?.id === node.id ? 'true' : undefined}
                style={{ top: slot.top }}
                onClick={() => explorer.selectSceneNode(node)}
              >
                <strong>{node.label}</strong>
                <span>{metaParts.join(' · ')}</span>
                {node.updatedAt ? (
                  <em>{new Date(node.updatedAt).toLocaleString(language)}</em>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {hoveredNode && phase === 'open' ? (
        <div className="globe-hover-readout" aria-hidden="true">
          <span>{hoveredNode.type}</span>
          <strong>{hoveredNode.label}</strong>
          {hoveredNode.path ? <em>{hoveredNode.path}</em> : null}
        </div>
      ) : null}

      {phase === 'open' && explorer.canGoBack ? (
        <nav className="globe-spatial-breadcrumbs" aria-label={t('dashboard.coreBreadcrumbs')}>
          <button type="button" onClick={explorer.resetExplorer}>
            {t('dashboard.coreOverview')}
          </button>
          {explorer.breadcrumbs.slice(1).map((crumb) => (
            <span key={crumb.id}>{crumb.label}</span>
          ))}
        </nav>
      ) : null}

      {loading ? (
        <div className="globe-loading">
          <span className="dash-skeleton dash-skeleton-orb" />
          <span>{t('dashboard.loadingNodes')}</span>
        </div>
      ) : null}

      {!loading && groups.length === 0 ? (
        <div className="globe-empty-state">
          <div className="globe-fallback-orb" aria-hidden="true" />
          <strong>{t('dashboard.noLiveNodes')}</strong>
          <span>{t('dashboard.noClassifiedHint')}</span>
        </div>
      ) : null}

      {webGlState === 'failed' ? (
        <div className="globe-fallback" role="status">
          <div className="globe-fallback-orb" aria-hidden="true" />
          <strong>{t('dashboard.coreWebGlUnavailable')}</strong>
          <span>{t('dashboard.coreWebGlFallback')}</span>
          <button
            type="button"
            onClick={() => {
              setWebGlState('checking');
              setRendererVersion((current) => current + 1);
            }}
          >
            {t('dashboard.coreRetry3d')}
          </button>
        </div>
      ) : null}

      {phase === 'open' && groups.length ? (
        <div id="globe-data-directory">
          <GlobeNodePanel
            groups={groups}
            nodes={sceneNodes}
            activeGroupId={activeGroupId}
            onGroupChange={setActiveGroupId}
            selectedNode={selectedNode}
            onNodeSelect={explorer.selectSceneNode}
            onNodeClear={onNodeClear}
            onNodeOpen={onNodeOpen}
            onNodeExplore={explorer.enterFolder}
            searchText={searchQuery}
            onSearchTextChange={setSearchQuery}
            browseState={explorer.browseState}
            t={t}
            language={language}
          />
        </div>
      ) : null}

      {phase === 'open' && groups.length ? (
        <>
          <aside
            className="globe-reference-panel globe-reference-panel-left"
            aria-label={t('dashboard.coreSummary')}
          >
            <header>
              <span>{t('dashboard.coreEyebrow')}</span>
              <strong>{t('dashboard.coreSummary')}</strong>
            </header>
            <dl>
              <div>
                <dt>{t('dashboard.files')}</dt>
                <dd>{visibleNodes.length}</dd>
              </div>
              <div>
                <dt>{t('dashboard.coreGroups')}</dt>
                <dd>{groups.length}</dd>
              </div>
              <div>
                <dt>{t('dashboard.coreConnections')}</dt>
                <dd>{renderedLinkCount}</dd>
              </div>
            </dl>
            <ul>
              {groups.slice(0, 4).map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => setActiveGroupId(group.id)}
                    aria-current={activeGroupId === group.id ? 'true' : undefined}
                  >
                    <i
                      style={{ '--group-color': `#${group.color.toString(16).padStart(6, '0')}` }}
                    />
                    <span>{t(group.labelKey)}</span>
                    <em>{group.nodes.length}</em>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <aside
            className="globe-reference-panel globe-reference-panel-right"
            aria-label={t('dashboard.coreNodeInformation')}
          >
            <header>
              <span>
                {selectedNode ? t('dashboard.coreSelected') : t('dashboard.coreNodeInformation')}
              </span>
              <strong>{selectedNode?.label || t('dashboard.coreTitle')}</strong>
            </header>
            {selectedNode ? (
              <dl>
                <div>
                  <dt>{t('dashboard.type')}</dt>
                  <dd>{selectedNode.type}</dd>
                </div>
                <div>
                  <dt>{t('dashboard.status')}</dt>
                  <dd className={`status-text-${selectedNode.status}`}>{selectedNode.status}</dd>
                </div>
                <div className="globe-reference-path">
                  <dt>{t('dashboard.updated')}</dt>
                  <dd>{selectedNode.path || t('dashboard.coreUnavailable')}</dd>
                </div>
              </dl>
            ) : (
              <p>{t('dashboard.coreExpandHint')}</p>
            )}
          </aside>
        </>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {stateAnnouncement}
      </span>
    </section>
  );

  return isFullscreen ? createPortal(globeContent, document.body) : globeContent;
}
