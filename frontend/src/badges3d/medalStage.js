/**
 * The 3D tier medals: each badge SVG extruded layer by layer into metal and enamel, set on a
 * medal disc, lit by a baked studio, with a per-tier charm (glow, particles) and a sweeping shine.
 * Built and tuned in a standalone lab; this is that engine, unchanged, behind createMedalStage.
 * three is imported here only, so it loads with the badges screen and not with the app.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'

const SVGS = import.meta.glob('../assets/badges/*.svg', { query: '?raw', import: 'default' })
async function svgFor(tier) {
  const key = Object.keys(SVGS).find((k) => k.includes(`/${String(tier).padStart(2, '0')}-`))
  return key ? SVGS[key]() : ''
}

// What each SVG gradient id is made of. Anything unnamed here is judged by its colour.
const KIND_BY_ID = [
  [/halo|aura/i, 'aura'],
  [/fire|ember|flame/i, 'glow'],
  [/eye|violet|amethyst|gem|ruby|sapphire/i, 'gem'],
  [/horn|bone|ivory/i, 'bone'],
  [/iron|bronze|silver|steel|gold|copper|brass|chrome|metal|plat|rim|helm|wing|ball/i, 'metal'],
];
const kindOf = (id) => KIND_BY_ID.find(([re]) => re.test(id))?.[1] ?? null;

const S = 1 / 40;            // SVG units (96 box) to world units: the badge is about 2.4 wide
const BASE_DEPTH = 5;        // the shield plate
const LAYER_DEPTH = 1.4;     // every layer stacked on it


function studio(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color().setRGB(0.04, 0.035, 0.04);
  const card = (w, h, [r, g, b], pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b), side: THREE.DoubleSide, toneMapped: false }));
    m.position.set(...pos); m.lookAt(0, 0, 0); room.add(m);
  };
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) card(1.08, 1.2, [3.6, 3.4, 3.0], [-5 + (i - 1.5) * 0.78, 4.2 + (j - 1) * 0.88, 4.8]);
  card(3.0, 5.4, [0.9, 0.62, 0.48], [6, 1.6, 2]);        // warm side card, matches the red room
  card(2.0, 4.6, [1.1, 0.5, 0.42], [2.5, 2.2, -5.5]);    // red rim from behind
  card(7.5, 2.2, [0.5, 0.5, 0.55], [0, 6, 0]);
  card(9, 9, [0.06, 0.05, 0.05], [0, -4, 0]);
  card(0.7, 7, [2.6, 2.5, 2.4], [-2.4, 0.4, 6.5]);       // two strip lights that run along bevels
  card(0.5, 7, [1.4, 1.35, 1.3], [2.8, -0.2, 6.5]);
  // A broad softbox just above the viewer: faces pointing at the camera reflect it, not the dark room.
  card(7, 3.2, [1.15, 1.08, 1.0], [0.4, 2.6, 8.5]);
  card(5, 1.6, [0.35, 0.3, 0.3], [0, -2.4, 8.5]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.008).texture;
  pmrem.dispose();
  return env;
}

// Concentric brushing, so highlights streak around the badge like turned metal.
function brushed() {
  const size = 1024;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(0,90,0)'; g.fillRect(0, 0, size, size);
  for (let r = 2; r < size * 0.72; r += 1.3) {
    g.strokeStyle = `rgb(0,${(70 + Math.random() * 50 + (Math.random() < 0.03 ? 50 : 0)) | 0},0)`;
    g.lineWidth = 0.6 + Math.random();
    g.beginPath(); g.arc(size / 2, size / 2, r, 0, Math.PI * 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const BRUSHED = brushed();

// Soft contact shadow under the badge.
function shadowPlane() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = -1.75;
  return m;
}

// ---------------------------------------------------------------- SVG colour to material
function gradientTable(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const table = {};
  for (const el of doc.querySelectorAll('linearGradient, radialGradient')) {
    const stops = [...el.querySelectorAll('stop')].map((s) => ({
      at: parseFloat(s.getAttribute('offset') ?? '0') || 0,
      color: new THREE.Color(s.getAttribute('stop-color') ?? '#000'),
    }));
    // Average weighted by how much of the ramp each stop covers.
    const avg = new THREE.Color(0, 0, 0);
    let brightest = stops[0]?.color ?? new THREE.Color('#888');
    stops.forEach((s, i) => {
      const lo = i === 0 ? 0 : (stops[i - 1].at + s.at) / 2;
      const hi = i === stops.length - 1 ? 1 : (s.at + stops[i + 1].at) / 2;
      avg.add(s.color.clone().multiplyScalar(hi - lo));
      if (s.color.getHSL({}).l > brightest.getHSL({}).l) brightest = s.color;
    });
    table[el.id] = { avg, brightest, kind: kindOf(el.id) };
  }
  return table;
}

function resolveColor(value, grads) {
  if (!value || value === 'none' || value === 'transparent') return null;
  const ref = /url\(#([^)]+)\)/.exec(value);
  if (ref) {
    const g = grads[ref[1]];
    return g ? { color: g.avg.clone(), bright: g.brightest.clone(), kind: g.kind, gradient: true } : null;
  }
  return { color: new THREE.Color(value), bright: new THREE.Color(value), kind: null, gradient: false };
}

const hslOf = (c) => c.getHSL({ h: 0, s: 0, l: 0 });

// The SVG fakes lighting with dark-to-light ramps. In 3D the studio does the lighting, so a metal's
// base colour is the ramp's hue at a bright, even value; the ramp's dark stops would just make it dull.
// Dark metals stay darker than bright ones, so blackened steel never turns into silver.
function metalColor(c) {
  const { h, s, l } = hslOf(c);
  // Gold needs real saturation or it reads as cream; every other metal stays restrained.
  const gold = h > 0.08 && h < 0.17 && s > 0.35;
  return gold
    ? new THREE.Color().setHSL(h, Math.max(s, 0.72), THREE.MathUtils.clamp(l * 1.3, 0.42, 0.6))
    : new THREE.Color().setHSL(h, Math.min(s, 0.55), THREE.MathUtils.clamp(l * 1.6, 0.26, 0.76));
}

function materialFor(info, { stroke = false } = {}) {
  const { h, s, l } = hslOf(info.color);
  if (info.kind === 'glow') {
    // Glow in the flame's own colour: the ramp's average, not its white-hot tip.
    const c = new THREE.Color().setHSL(h, Math.min(1, s * 1.15), THREE.MathUtils.clamp(l, 0.35, 0.5));
    return new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: stroke ? 1.1 : 0.7, metalness: 0.1, roughness: 0.4 });
  }
  if (info.kind === 'aura') {
    // A halo is polished gold that gives off a little light, never a white disc.
    const c = new THREE.Color().setHSL(h, 0.8, 0.42);
    return new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.08, metalness: 1, roughness: 0.42, roughnessMap: BRUSHED });
  }
  if (info.kind === 'gem') {
    const c = new THREE.Color().setHSL(h, Math.min(1, s * 1.2), THREE.MathUtils.clamp(l, 0.3, 0.55));
    return new THREE.MeshPhysicalMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, metalness: 0.1, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 });
  }
  if (info.kind === 'bone') {
    return new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(h, Math.min(s, 0.35), THREE.MathUtils.clamp(l * 1.4, 0.55, 0.8)), metalness: 0, roughness: 0.6, sheen: 0.4 });
  }
  const isMetal = info.kind === 'metal' || (info.kind == null && (s < 0.22 || (h > 0.07 && h < 0.17 && l > 0.45)));
  if (stroke) {
    // Light strokes are polished rims; dark strokes are recessed seams.
    const bright = hslOf(info.bright).l > 0.45;
    return bright
      ? new THREE.MeshPhysicalMaterial({ color: metalColor(info.bright), metalness: 1, roughness: 0.16 })
      : new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(h, s * 0.6, 0.16), metalness: 0.85, roughness: 0.5 });
  }
  if (l < 0.16 && !info.gradient) {
    // Near-black fills: blackened, slightly rough gunmetal, so the parts around them read.
    return new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(h, Math.min(s, 0.35), 0.2), metalness: 0.9, roughness: 1.3, roughnessMap: BRUSHED });
  }
  if (isMetal) {
    // roughness 1 times the brushed map (0.27 to 0.47): satin, with streaks, never a black mirror.
    return new THREE.MeshPhysicalMaterial({ color: metalColor(info.color), metalness: 1, roughness: 1, roughnessMap: BRUSHED });
  }
  // Coloured fills are fired enamel: glossy colour under a clear coat.
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(h, Math.min(1, s * 1.1), THREE.MathUtils.clamp(l, 0.22, 0.5)),
    metalness: 0.05, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04,
  });
}

// ---------------------------------------------------------------- SVG to relief
function bevelFor(shape, base) {
  const pts = shape.getPoints(8);
  const box = new THREE.Box2().setFromPoints(pts);
  const size = Math.min(box.max.x - box.min.x, box.max.y - box.min.y);
  const b = base ? 1.2 : Math.min(0.55, size * 0.07);
  return { bevelEnabled: b > 0.05, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: base ? 6 : 4 };
}

function tubeAlong(points, radius, closed) {
  if (points.length < 2) return null;
  const path = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]));
  if (closed && !points[0].equals(points[points.length - 1])) path.add(new THREE.LineCurve3(points[points.length - 1], points[0]));
  const segs = Math.max(24, points.length * 6);
  return new THREE.TubeGeometry(path, segs, radius, 10, false);
}

function buildBadge(svgText) {
  const grads = gradientTable(svgText);
  const data = new SVGLoader().parse(svgText);
  const group = new THREE.Group();
  let zTop = 0;
  let first = true;

  for (const path of data.paths) {
    const style = path.userData.style;
    const fill = resolveColor(style.fill, grads);
    let layerTop = zTop;

    // Translucent fills are 2D shading tricks; real light does that job in 3D, so they are skipped.
    if (fill && (style.fillOpacity ?? 1) > 0.5 && (style.opacity ?? 1) > 0.5) {
      const mat = materialFor(fill);
      const depth = first ? BASE_DEPTH : LAYER_DEPTH;
      for (const shape of SVGLoader.createShapes(path)) {
        const bevel = bevelFor(shape, first);
        const geo = new THREE.ExtrudeGeometry(shape, { depth, curveSegments: 16, ...bevel });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.tag = tagOf(style.fill);
        // Each layer sits on the face of the one under it, overlapping a little so no seam shows.
        mesh.position.z = zTop + bevel.bevelThickness - (first ? 0 : 0.25);
        layerTop = Math.max(layerTop, mesh.position.z + depth + bevel.bevelThickness);
        group.add(mesh);
      }
      first = false;
    }

    const strokeInfo = resolveColor(style.stroke, grads);
    const strokeOk = strokeInfo && (style.strokeOpacity ?? 1) >= 0.8 && style.strokeWidth > 0;
    if (strokeOk) {
      const mat = materialFor(strokeInfo, { stroke: true });
      const r = (style.strokeWidth / 2);
      const zLine = fill ? layerTop - r * 0.35 : layerTop + r * 0.6;
      for (const sub of path.subPaths) {
        const pts = sub.getPoints().map((p) => new THREE.Vector3(p.x, p.y, zLine));
        const closed = sub.autoClose || (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 0.01);
        const geo = tubeAlong(pts, r, closed);
        if (geo) { const m = new THREE.Mesh(geo, mat); m.userData.tag = tagOf(style.stroke); group.add(m); }
        if (!closed && style.strokeLineCap === 'round') {
          for (const end of [pts[0], pts[pts.length - 1]]) {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
            cap.position.copy(end); group.add(cap);
          }
        }
      }
      if (!fill) layerTop += r * 1.2;
    }
    zTop = layerTop;
  }

  // Every badge stands on a medal disc in its own metal, unless its artwork already has one.
  const hasDisc = data.paths.some((p) => p.subPaths.some((sp) => {
    const pts = sp.getPoints(); if (pts.length < 8) return false;
    const box = new THREE.Box2().setFromPoints(pts);
    return box.max.x - box.min.x > 60 && Math.abs((box.max.x - box.min.x) - (box.max.y - box.min.y)) < 4;
  }));
  if (!hasDisc) {
    const main = Object.entries(grads).find(([, g]) => g.kind === 'metal')?.[1] ?? Object.values(grads)[0];
    const base = main ? metalColor(main.avg) : new THREE.Color(0.7, 0.7, 0.72);
    // A step darker than the shield, so the shield reads as raised off the medal.
    const face = new THREE.MeshPhysicalMaterial({ color: base.clone().offsetHSL(0, 0.05, -0.16), metalness: 1, roughness: 1, roughnessMap: BRUSHED });
    const rimMat = new THREE.MeshPhysicalMaterial({ color: base.clone().offsetHSL(0, 0, 0.08), metalness: 1, roughness: 0.18 });
    const groove = new THREE.MeshPhysicalMaterial({ color: base.clone().multiplyScalar(0.35), metalness: 1, roughness: 0.5 });
    const R = 47;   // the shield is 87 tall; a 94 disc frames it like a medal
    const shape = new THREE.Shape().absarc(48, 48, R, 0, Math.PI * 2, false);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.4, curveSegments: 96, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.9, bevelSegments: 5 });
    const plate = new THREE.Mesh(geo, face);
    plate.userData.part = 'disc';
    plate.position.z = -1.6;
    group.add(plate);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.2, 1.3, 16, 128), rimMat);
    rim.userData.part = 'discRim';
    rim.position.set(48, 48, 1.6);
    group.add(rim);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 5, 0.45, 10, 128), groove);
    ring.position.set(48, 48, 1.75);
    group.add(ring);
  }

  // SVG is y-down in a 96 box: flip, scale, and centre on the badge's own middle.
  group.scale.set(S, -S, S);
  const box = new THREE.Box3().setFromObject(group);
  const centre = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  group.position.sub(centre);
  wrap.add(group);
  wrap.userData.inner = group;
  return wrap;
}

const tagOf = (v) => (/url\(#([^)]+)\)/.exec(v || '')?.[1] ?? (v || '').toLowerCase());

// ---------------------------------------------------------------- charms
// Each tier's own character: a disc material, parts that glow and breathe, and a particle effect.
// The charm grows with the tier: 1-5 material only, 6-10 one living effect, 11-20 their own world.
const CHARMS = {
  3: { pulse: { tags: ['blue'], color: '#7cc2dc', amp: 0.5, speed: 1.6 } },
  4: { fx: [{ type: 'motes', color: '#ffcf80', count: 16, size: 0.035 }] },
  5: { pulse: { tags: ['ember'], color: '#ff8a2a', amp: 1.4, speed: 3 }, fx: [{ type: 'rise', color: '#ff7a2a', count: 14, size: 0.03, speed: 0.45 }] },
  6: { disc: { color: '#7a2a1e', roughness: 0.6 }, fx: [{ type: 'motes', color: '#ffd36a', count: 18, size: 0.035 }] },
  7: { pulse: { tags: ['eye'], color: '#5fd3dc', amp: 0.9, speed: 1.2 }, fx: [{ type: 'motes', color: '#8ff0f5', count: 12, size: 0.03 }] },
  8: { disc: { color: '#2a2230', roughness: 0.45 }, pulse: { tags: ['violet'], color: '#b07cff', amp: 1, speed: 1.5 }, fx: [{ type: 'motes', color: '#c9a2ff', count: 16, size: 0.032 }] },
  9: { disc: { color: '#cfcad8', roughness: 0.35 }, pulse: { tags: ['amethyst'], color: '#c08cff', amp: 0.9, speed: 1.3 }, fx: [{ type: 'sparkle', color: '#e6d4ff', count: 24, size: 0.04 }] },
  10: { fx: [{ type: 'orbit', color: '#ffd76a', count: 40, size: 0.035, speed: 0.35 }] },
  11: { disc: { color: '#17181b', roughness: 0.3 }, fx: [{ type: 'fall', color: '#ffd36a', count: 30, size: 0.028, speed: 0.18 }] },
  12: { disc: { color: '#6a1014', metalness: 0.6, roughness: 0.38 }, chrome: ['steel'], fx: [{ type: 'sparkle', color: '#ffffff', count: 10, size: 0.05 }] },
  13: { disc: { color: '#0b0b0e', roughness: 0.12, clearcoat: 1 }, fx: [{ type: 'smoke', color: '#1a1416', count: 16, size: 0.9, speed: 0.12 }] },
  14: { disc: { color: '#1d3266', roughness: 0.35 }, pulse: { tags: ['rim'], color: '#5aa8ff', amp: 0.35, speed: 7, flicker: true }, fx: [{ type: 'spark', color: '#8cc8ff', count: 26, size: 0.045 }] },
  15: { disc: { color: '#5a3a22', metalness: 0.7, roughness: 0.95 }, fx: [{ type: 'rise', color: '#ff7a2a', count: 36, size: 0.032, speed: 0.55 }] },
  16: { disc: { color: '#8fd2c8', metalness: 0.2, roughness: 0.15, transmission: 0.6, thickness: 0.5 }, pulse: { tags: ['helm'], color: '#5fe0d0', amp: 0.6, speed: 0.9 }, fx: [{ type: 'mist', color: '#9ff3ea', count: 30, size: 0.06, speed: 0.08 }] },
  17: { disc: { color: '#121212', roughness: 0.7 }, chrome: ['steel'], fx: [{ type: 'fall', color: '#9a9a9a', count: 34, size: 0.03, speed: 0.22 }] },
  18: { disc: { color: '#24100a', emissive: '#ff4a10', emissiveIntensity: 0.07, roughness: 0.75 }, pulse: { tags: ['fire'], color: '#ff6a10', amp: 1.2, speed: 4, flicker: true }, fx: [{ type: 'rise', color: '#ff6a1a', count: 60, size: 0.04, speed: 0.75 }] },
  19: { disc: { color: '#3a1a66', roughness: 0.35 }, pulse: { tags: ['#7a1418', '#2a5ab0'], color: null, amp: 1.6, speed: 2 }, fx: [{ type: 'motes', color: '#b07cff', count: 26, size: 0.04 }] },
  20: { pulse: { tags: ['halo'], color: '#ffd76a', amp: 0.35, speed: 1 }, fx: [{ type: 'orbit', color: '#ffe08a', count: 70, size: 0.04, speed: 0.3 }, { type: 'motes', color: '#fff2c0', count: 20, size: 0.03 }] },
};

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DOT = dotTexture();
const rand = (a, b) => a + Math.random() * (b - a);

// One particle effect, in the badge's own space (the badge is about 2.4 wide, the disc radius about 1.2).
function particles({ type, color, count, size, speed = 0.3 }) {
  const pos = new Float32Array(count * 3);
  const seed = Array.from({ length: count }, () => ({ a: rand(0, Math.PI * 2), r: rand(0.6, 1.7), p: Math.random(), v: rand(0.6, 1.4) }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const smoke = type === 'smoke';
  const mat = new THREE.PointsMaterial({ color: new THREE.Color(color), size: size * (smoke ? 1.8 : 3.2), map: DOT, transparent: true, depthWrite: false,
    blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: smoke ? 0.35 : 0.9, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 2;
  const update = (t) => {
    seed.forEach((q, i) => {
      let x, y, z;
      const k = (q.p + t * speed * q.v) % 1;
      if (type === 'rise' || type === 'smoke') { x = Math.cos(q.a) * q.r * 0.75 + Math.sin(t * 2 + i) * 0.05; y = -1.3 + k * 3; z = smoke ? -0.5 : rand(0.1, 0.5); }
      else if (type === 'fall') { x = Math.cos(q.a) * q.r * 0.8; y = 1.5 - k * 3; z = 0.45; }
      else if (type === 'orbit') { const a = q.a + t * speed * q.v; x = Math.cos(a) * (1.25 + q.r * 0.08); y = Math.sin(a) * (1.25 + q.r * 0.08); z = Math.sin(a * 2) * 0.15; }
      else if (type === 'spark') { const on = Math.sin(t * 9 * q.v + i * 3.1) > 0.75; const a = q.a + Math.floor(t * 3 + i) * 1.7; x = Math.cos(a) * 1.25; y = Math.sin(a) * 1.25; z = on ? 0.2 : 99; }
      else if (type === 'mist') { const a = q.a + t * speed; x = Math.cos(a) * q.r; y = -1.1 + Math.sin(t * 0.4 + i) * 0.25; z = Math.sin(a) * 0.6; }
      else if (type === 'sparkle') { const tw = Math.sin(t * 2.5 * q.v + i); x = Math.cos(q.a) * q.r * 0.7; y = Math.sin(q.a) * q.r * 0.8; z = tw > 0.6 ? 0.55 : 99; }
      else { x = Math.cos(q.a + t * 0.1 * q.v) * q.r; y = Math.sin(q.a * 1.3 + t * 0.15 * q.v) * q.r * 0.9; z = 0.3 + Math.sin(t + i) * 0.2; }  // motes
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    });
    geo.attributes.position.needsUpdate = true;
  };
  return { pts, update };
}

function applyCharm(wrap, charm) {
  if (!charm || wrap.userData.charmed) return;
  wrap.userData.charmed = true;
  const pulses = [];
  wrap.traverse((m) => {
    if (!m.isMesh) return;
    if (charm.disc && m.userData.part === 'disc') {
      const { color, emissive, ...rest } = charm.disc;
      m.material = m.material.clone();
      Object.assign(m.material, rest);
      if (color) m.material.color = new THREE.Color(color);
      if (emissive) m.material.emissive = new THREE.Color(emissive);
      if (rest.roughness !== undefined && rest.roughness < 0.5) m.material.roughnessMap = null;
    }
    if (charm.chrome?.includes(m.userData.tag)) {
      m.material = m.material.clone();
      // Bright polished steel, not a mirror: a mirror only shows the dark room.
      m.material.roughness = 0.3; m.material.roughnessMap = null; m.material.metalness = 1;
      m.material.color.setHSL(0.6, 0.04, 0.82);
    }
    if (charm.pulse?.tags.includes(m.userData.tag)) {
      m.material = m.material.clone();
      m.material.emissive = new THREE.Color(charm.pulse.color ?? m.material.color);
      pulses.push(m.material);
    }
  });
  const fx = (charm.fx ?? []).map((f) => particles(f));
  fx.forEach((f) => wrap.add(f.pts));
  wrap.userData.charmUpdate = (t) => {
    if (charm.pulse) {
      const { amp, speed, flicker } = charm.pulse;
      const wave = flicker ? (Math.sin(t * speed) > 0.2 ? 1 : 0.25) * (0.7 + 0.3 * Math.sin(t * 31)) : 0.5 + 0.5 * Math.sin(t * speed);
      pulses.forEach((mat) => { mat.emissiveIntensity = amp * wave; });
    }
    fx.forEach((f) => f.update(t));
  };
}

// Where a fact's SVG point lands on the badge's front surface, in the wrap's own space.
function anchorOnSurface(wrap, [x, y]) {
  wrap.updateMatrixWorld(true);
  const inner = wrap.userData.inner;
  const from = inner.localToWorld(new THREE.Vector3(x, y, 400));
  const to = inner.localToWorld(new THREE.Vector3(x, y, -400));
  const ray = new THREE.Raycaster(from, to.sub(from).normalize());
  const hit = ray.intersectObject(inner, true)[0];
  const p = hit ? hit.point : inner.localToWorld(new THREE.Vector3(x, y, 0));
  return wrap.worldToLocal(p.clone());
}


// A locked medal is cold: one dark metal, no charm, no particles.
const LOCKED_MAT = new THREE.MeshPhysicalMaterial({ color: 0x55585e, metalness: 0.75, roughness: 0.62 })
const SHARED_MAPS = new Set([BRUSHED, DOT])

function disposeBadge(root) {
  root.traverse((m) => {
    m.geometry?.dispose()
    if (!m.material || m.material === LOCKED_MAT) return
    const map = m.material.map
    if (map && !SHARED_MAPS.has(map)) map.dispose()
    m.material.dispose()
  })
}
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3)

/**
 * mode 'hero': the medal turns on its own; a drag takes over and it resumes 3 s after release.
 * mode 'showcase': the medal sways gently so fact lines stay pinned to their parts; drag still spins it.
 */
export function createMedalStage({ canvas, mode = 'hero', reducedMotion = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15

  const scene = new THREE.Scene()
  scene.environment = studio(renderer)
  scene.add(shadowPlane())
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
  camera.position.set(0, 0, mode === 'hero' ? 5.6 : 7)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enableZoom = false
  controls.enablePan = false
  controls.minPolarAngle = Math.PI / 2 - 0.55
  controls.maxPolarAngle = Math.PI / 2 + 0.55
  controls.autoRotate = mode === 'hero' && !reducedMotion
  controls.autoRotateSpeed = 2.4
  let resume = 0
  const onStart = () => { clearTimeout(resume); controls.autoRotate = false }
  const onEnd = () => { if (mode === 'hero' && !reducedMotion) resume = window.setTimeout(() => { controls.autoRotate = true }, 3000) }
  controls.addEventListener('start', onStart)
  controls.addEventListener('end', onEnd)

  // The shine: a warm light that sweeps diagonally across the medal every 3.6 s, then rests.
  const shine = new THREE.DirectionalLight(0xfff6e8, 0)
  scene.add(shine)
  const updateShine = (t) => {
    const p = (t % 3.6) / 3.6
    const s = Math.min(1, p / 0.42)
    shine.position.set(-6 + 12 * s, 5 - 7 * s, 4)
    shine.intensity = reducedMotion || p >= 0.42 ? 0 : Math.sin(Math.PI * s) * 3.2   // a glint, not a flood
  }

  // Built medals hold 20k to 110k triangles of GPU memory each, so only the last few stay built.
  const cache = new Map()
  const KEEP = 3
  let current = null
  let shownAt = 0
  let token = 0
  const t0 = performance.now()
  const elapsed = () => (performance.now() - t0) / 1000

  async function show(tier, { locked = false } = {}) {
    const mine = ++token
    const key = `${tier}${locked ? ':locked' : ''}`
    let badge = cache.get(key)
    if (!badge) {
      badge = buildBadge(await svgFor(tier))
      if (locked) badge.traverse((m) => { if (m.isMesh) m.material = LOCKED_MAT })
      else applyCharm(badge, CHARMS[tier])
      badge.userData.anchors = new Map()
    }
    cache.delete(key)
    cache.set(key, badge)
    for (const [k, b] of cache) {
      if (cache.size <= KEEP) break
      if (b !== current) { disposeBadge(b); cache.delete(k) }
    }
    if (mine !== token) return   // a newer request won the race
    if (current) scene.remove(current)
    current = cache.get(key)
    current.rotation.set(0, 0, 0)
    current.position.set(0, 0, 0)
    scene.add(current)
    shownAt = elapsed()
  }

  /** Where a point on the badge (SVG units, 96 box) is on screen, in CSS px from the canvas's top left,
   *  and how squarely it faces the viewer (0 = edge-on or behind, 1 = facing). */
  function project([x, y]) {
    if (!current) return null
    const k = `${x},${y}`
    if (!current.userData.anchors.has(k)) current.userData.anchors.set(k, anchorOnSurface(current, [x, y]))
    const world = current.localToWorld(current.userData.anchors.get(k).clone())
    const front = new THREE.Vector3(0, 0, 1).applyQuaternion(current.getWorldQuaternion(new THREE.Quaternion()))
    const facing = clamp01((front.dot(camera.position.clone().sub(world).normalize()) - 0.3) / 0.25)
    const p = world.project(camera)
    const r = canvas.getBoundingClientRect()
    return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height, facing }
  }

  // A tap (not a drag) on the medal.
  let tapHandler = null
  let down = null
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() } }
  const onUp = (e) => {
    if (!down) return
    const still = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 350
    down = null
    if (still) tapHandler?.()
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)

  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(fit)
  ro.observe(canvas)
  fit()

  renderer.setAnimationLoop(() => {
    const t = elapsed()
    updateShine(t)
    if (current) {
      const since = t - shownAt
      const enter = reducedMotion ? 1 : easeOut(since / 0.8)
      current.scale.setScalar(0.86 + 0.14 * enter)
      const sway = mode === 'showcase' && !reducedMotion ? Math.sin(since * 0.5) * 0.3 : 0
      current.rotation.y = sway - (1 - enter) * 0.9
      current.position.y = reducedMotion ? 0 : Math.sin(t * 1.1) * 0.04
      current.userData.charmUpdate?.(reducedMotion ? 2.3 : t)
    }
    controls.update()
    renderer.render(scene, camera)
  })

  return {
    show,
    project,
    onTap(fn) { tapHandler = fn },
    dispose() {
      renderer.setAnimationLoop(null)
      clearTimeout(resume)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      controls.dispose()
      for (const b of cache.values()) disposeBadge(b)
      disposeBadge(scene)
      scene.environment.dispose()
      renderer.dispose()
      // Free the context now: each visit to the medal close-up makes a new one, and browsers cap them.
      renderer.forceContextLoss()
    },
  }
}
