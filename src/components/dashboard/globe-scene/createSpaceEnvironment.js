import * as THREE from 'three';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeStarLayer({ count, radiusMin, radiusMax, size, opacity, seed, color }) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(color);
  const violet = new THREE.Color(0xa78bfa);

  for (let index = 0; index < count; index += 1) {
    const radius = THREE.MathUtils.lerp(radiusMin, radiusMax, random());
    const azimuth = random() * Math.PI * 2;
    const cosine = random() * 2 - 1;
    const sine = Math.sqrt(1 - cosine * cosine);
    positions[index * 3] = radius * sine * Math.cos(azimuth);
    positions[index * 3 + 1] = radius * cosine;
    positions[index * 3 + 2] = radius * sine * Math.sin(azimuth);
    const starColor = random() > 0.88 ? violet : base;
    const intensity = 0.55 + random() * 0.45;
    colors[index * 3] = starColor.r * intensity;
    colors[index * 3 + 1] = starColor.g * intensity;
    colors[index * 3 + 2] = starColor.b * intensity;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size,
    transparent: true,
    opacity,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geometry, material);
}

function makeGalaxyBand(count, compact) {
  const random = seededRandom(0x5a17b00b);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = new THREE.Color(0x38bdf8);
  const violet = new THREE.Color(0x8b5cf6);

  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 7 + random() * 8;
    const arm = Math.sin(angle * 2.2) * 0.9;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = (random() - 0.5) * (compact ? 1.8 : 2.8) + arm;
    positions[index * 3 + 2] = Math.sin(angle) * radius - 5;
    const mix = random();
    const color = cyan.clone().lerp(violet, mix);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: compact ? 0.055 : 0.075,
    transparent: true,
    opacity: 0.23,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const band = new THREE.Points(geometry, material);
  band.rotation.set(-0.22, 0, -0.34);
  return band;
}

function makeNebulaShell() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uCyan: { value: new THREE.Color(0x063d63) },
      uViolet: { value: new THREE.Color(0x2a174d) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uCyan;
      uniform vec3 uViolet;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      void main() {
        vec3 p = vWorld * 4.3;
        float cloud = hash(floor(p * 5.0));
        cloud = smoothstep(0.42, 0.92, cloud + sin(p.x * 1.8 + p.y * 2.4 + uTime * 0.03) * 0.18);
        float band = pow(max(0.0, 1.0 - abs(vWorld.y * 1.7 + vWorld.x * 0.22)), 3.0);
        vec3 color = mix(uViolet, uCyan, smoothstep(-0.35, 0.55, vWorld.x));
        float alpha = 0.035 + band * (0.08 + cloud * 0.13);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(24, 40, 24), material);
  return shell;
}

export function createSpaceEnvironment({ compact = false } = {}) {
  const group = new THREE.Group();
  group.name = 'DashboardSpaceEnvironment';
  const nebula = makeNebulaShell();
  const farStars = makeStarLayer({
    count: compact ? 420 : 900,
    radiusMin: 13,
    radiusMax: 22,
    size: compact ? 0.055 : 0.07,
    opacity: 0.72,
    seed: 0x10f0aa,
    color: 0xbcecff,
  });
  const middleStars = makeStarLayer({
    count: compact ? 180 : 420,
    radiusMin: 7,
    radiusMax: 13,
    size: compact ? 0.035 : 0.048,
    opacity: 0.5,
    seed: 0x2c31d5,
    color: 0x67e8f9,
  });
  const dust = makeStarLayer({
    count: compact ? 70 : 150,
    radiusMin: 4.5,
    radiusMax: 8,
    size: compact ? 0.018 : 0.026,
    opacity: 0.2,
    seed: 0xc001d00d,
    color: 0xa78bfa,
  });
  const galaxy = makeGalaxyBand(compact ? 500 : 1100, compact);
  group.add(nebula, farStars, galaxy, middleStars, dust);

  return {
    group,
    update(seconds, paused) {
      nebula.material.uniforms.uTime.value = seconds;
      if (paused) return;
      farStars.rotation.y += 0.000025;
      middleStars.rotation.y -= 0.00006;
      dust.rotation.x += 0.000045;
      galaxy.rotation.y += 0.00002;
    },
  };
}
