// 3D Fit Studio: renders the mannequin (from your measurements) wearing the
// garment (from its size chart), with tap-able dimension callouts, a tension
// heat-map, a ghost of your reference garment, and size-to-size morphing.

import * as THREE from '../vendor/three-0.186.1.mjs';
import { OrbitControls } from '../vendor/three-0.186.1.mjs';
import { bodyModel, garmentModel, bodyAnchors } from './model3d.js';

const SEG = 40; // ring resolution

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

// ---------- geometry helpers ----------
function ringBasis(axis) {
  const ax = new THREE.Vector3(...(axis || [0, 1, 0])).normalize();
  let u = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 0, 1));
  if (u.lengthSq() < 1e-6) u = new THREE.Vector3(1, 0, 0);
  u.normalize();
  if (u.x < 0 && Math.abs(ax.y) > 0.9) u.negate();
  const v = new THREE.Vector3().crossVectors(u, ax).normalize();
  if (v.z < 0) v.negate();
  return { u, v };
}

// Fill a position array for a lofted tube through rings (+ optional end caps).
function loftPositions(rings, { capStart = false, capEnd = false } = {}, out) {
  const n = rings.length;
  const verts = n * (SEG + 1) + (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const pos = out || new Float32Array(verts * 3);
  let k = 0;
  for (const r of rings) {
    const { u, v } = ringBasis(r.axis);
    for (let s = 0; s <= SEG; s++) {
      const th = (s / SEG) * Math.PI * 2;
      const ca = Math.cos(th) * r.a, sb = Math.sin(th) * r.b;
      pos[k++] = r.c[0] + u.x * ca + v.x * sb;
      pos[k++] = r.c[1] + u.y * ca + v.y * sb;
      pos[k++] = r.c[2] + u.z * ca + v.z * sb;
    }
  }
  if (capStart) { pos[k++] = rings[0].c[0]; pos[k++] = rings[0].c[1]; pos[k++] = rings[0].c[2]; }
  if (capEnd) { const r = rings[n - 1]; pos[k++] = r.c[0]; pos[k++] = r.c[1]; pos[k++] = r.c[2]; }
  return pos;
}

function loftGeometry(rings, opts = {}) {
  const n = rings.length;
  const pos = loftPositions(rings, opts);
  const idx = [];
  const W = SEG + 1;
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < SEG; s++) {
    const a = i * W + s, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  let capIdx = n * W;
  if (opts.capStart) { for (let s = 0; s < SEG; s++) idx.push(capIdx, s + 1, s); capIdx++; }
  if (opts.capEnd) { const base = (n - 1) * W; for (let s = 0; s < SEG; s++) idx.push(capIdx, base + s, base + s + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData = { rings: n, opts };
  return g;
}

function tube(p1, p2, radius, material) {
  const a = new THREE.Vector3(...p1), b = new THREE.Vector3(...p2);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(radius, radius, len, 10, 1);
  const m = new THREE.Mesh(g, material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function ellipseRing(c, a, b, axis, radius, material) {
  const g = new THREE.TorusGeometry(1, radius / Math.max(a, b), 8, 64);
  const m = new THREE.Mesh(g, material);
  m.scale.set(a, b, Math.max(a, b));
  // Torus lies in XY; rotate so its plane is perpendicular to axis.
  const ax = new THREE.Vector3(...(axis || [0, 1, 0])).normalize();
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax);
  if (!axis) { m.scale.set(a, b, 1); m.rotation.set(Math.PI / 2, 0, 0); }
  m.position.set(...c);
  return m;
}

// ---------- colors ----------
const COLOR_WORDS = [
  [/navy|midnight|dark blue/, '#26324f'], [/black|onyx|jet/, '#1d1e22'], [/charcoal|graphite/, '#3b3e45'],
  [/heather|grey|gray|ash|silver/, '#9ca1aa'], [/off.?white|cream|ecru|ivory|oat|natural/, '#ece4d4'], [/white/, '#f3f3ef'],
  [/beige|khaki|tan|sand|stone|camel/, '#cbb48f'], [/brown|chocolate|mocha|coffee/, '#6d5240'], [/olive|army|moss/, '#5f6542'],
  [/green|sage|forest/, '#4c6e58'], [/blue|indigo|denim|cobalt/, '#40618f'], [/burgundy|maroon|wine/, '#5f2230'], [/red/, '#9b3131'],
];
export function colorFor(text, fallback = '#4b5c7e') {
  const t = String(text || '').toLowerCase();
  for (const [re, hex] of COLOR_WORDS) if (re.test(t)) return hex;
  return fallback;
}
const STATUS_COLORS = { ideal: '#34d399', ok: '#fbbf24', off: '#f87171', missing: '#94a3b8' };
function heat(ease, base) {
  if (ease < 3) return new THREE.Color('#f43f5e');
  if (ease < 8) return new THREE.Color('#f59e0b');
  if (ease < 14) return new THREE.Color('#34d399');
  return base.clone().lerp(new THREE.Color('#60a5fa'), 0.35);
}

// ---------- shared scene ----------
function makeStage(container, { height = 420, focusY = 110, distance = 260 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = 'studio-canvas';
  container.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  camera.position.set(distance * 0.42, focusY + 25, distance);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, focusY, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 90;
  controls.maxDistance = 520;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.1;
  let idleTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => { idleTimer = setTimeout(() => { controls.autoRotate = true; }, 7000); });

  scene.add(new THREE.HemisphereLight('#dfe8ff', '#1b2033', 1.4));
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(120, 260, 200); scene.add(key);
  const rim = new THREE.DirectionalLight('#7dd3fc', 1.6); rim.position.set(-180, 160, -220); scene.add(rim);
  const fill = new THREE.DirectionalLight('#c4b5fd', 0.7); fill.position.set(-200, 60, 160); scene.add(fill);

  // soft contact shadow + glowing floor ring
  const sh = document.createElement('canvas'); sh.width = sh.height = 128;
  const sctx = sh.getContext('2d');
  const grd = sctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grd; sctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.05; scene.add(shadow);
  const floorRing = new THREE.Mesh(new THREE.RingGeometry(44, 45.2, 96), new THREE.MeshBasicMaterial({ color: '#7c9cff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  floorRing.rotation.x = -Math.PI / 2; floorRing.position.y = 0.1; scene.add(floorRing);

  let visible = true;
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; });
  io.observe(container);
  const resize = () => {
    const w = container.clientWidth || 320;
    const h = height;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(container);

  const tickers = new Set();
  let raf, disposed = false;
  const loop = (t) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    for (const f of tickers) f(t);
    controls.update();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  // camera tween
  let tween = null;
  tickers.add(t => {
    if (!tween) return;
    const k = Math.min(1, (t - tween.t0) / tween.dur);
    const e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
    camera.position.lerpVectors(tween.fromP, tween.toP, e);
    if (k >= 1) tween = null;
  });
  const focus = (point, dist) => {
    const toT = new THREE.Vector3(...point);
    const dir = camera.position.clone().sub(controls.target).normalize();
    const d = dist ?? camera.position.distanceTo(controls.target);
    tween = { t0: performance.now(), dur: 650, fromT: controls.target.clone(), toT, fromP: camera.position.clone(), toP: toT.clone().add(dir.multiplyScalar(d)) };
  };

  const dispose = () => {
    disposed = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); controls.dispose();
    scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); });
    renderer.dispose(); canvas.remove();
  };
  // Hold still while the user is exploring a measurement; resume spinning later.
  const pause = (ms = 9000) => { controls.autoRotate = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { controls.autoRotate = true; }, ms); };
  container.addEventListener('pointerdown', () => pause(), { passive: true });
  return { renderer, scene, camera, controls, tickers, focus, dispose, canvas, pause };
}

// ---------- mannequin ----------
function buildBody(body, { lift = 0 } = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#d5d9e2', roughness: 0.62, metalness: 0.05 });
  const add = g => { const m = new THREE.Mesh(g, mat); group.add(m); return m; };
  add(loftGeometry(body.torso, { capStart: true, capEnd: true }));
  for (const arm of body.arms) {
    const rings = arm.rings.map(r => ({ c: arm.joint.map((v, j) => v + arm.dir[j] * r.t), a: r.r, b: r.r * 0.94, axis: arm.dir }));
    add(loftGeometry(rings, { capStart: true, capEnd: true }));
    const delt = add(new THREE.SphereGeometry(6.3, 24, 16)); delt.position.set(...arm.joint);
    const hand = add(new THREE.SphereGeometry(1, 20, 14));
    const hp = arm.joint.map((v, j) => v + arm.dir[j] * (arm.length + 5));
    hand.position.set(...hp); hand.scale.set(3.3, 5.5, 2.2);
  }
  for (const leg of body.legs) add(loftGeometry(leg, { capStart: true, capEnd: true }));
  const neck = add(new THREE.CylinderGeometry(body.neck.r, body.neck.r * 1.05, body.neck.y1 - body.neck.y0, 24));
  neck.position.set(0, (body.neck.y0 + body.neck.y1) / 2, 0);
  const head = add(new THREE.SphereGeometry(1, 32, 24));
  head.position.set(...body.head.c); head.scale.set(...body.head.r);
  for (const f of body.feet) {
    const foot = add(new THREE.SphereGeometry(1, 24, 16));
    foot.position.set(...f.c); foot.scale.set(f.size[0] / 2, f.size[1] / 2, f.size[2] / 2);
  }
  group.position.y = lift;
  return { group, mat };
}

// ---------- garment ----------
function buildGarment(model, colorHex, { ghost = false } = {}) {
  const group = new THREE.Group();
  const base = new THREE.Color(colorHex);
  const mat = ghost
    ? new THREE.MeshBasicMaterial({ color: '#5eead4', wireframe: true, transparent: true, opacity: 0.28 })
    : new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 1 });
  const parts = [];
  const addLoft = (rings, ease, opts) => {
    const g = loftGeometry(rings, opts);
    const m = new THREE.Mesh(g, mat);
    group.add(m);
    parts.push({ mesh: m, rings, ease, opts });
  };
  if (model.kind === 'top') {
    addLoft(model.rings, model.ease, {});
    for (const s of model.sleeves) addLoft(s.rings, s.rings.map(() => 20), {});
    if (!ghost) {
      const trimMat = new THREE.MeshStandardMaterial({ color: base.clone().lerp(new THREE.Color('#ffffff'), 0.06), roughness: 0.92, side: THREE.DoubleSide });
      if (model.hood) {
        const top = model.rings[0];
        const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), trimMat);
        hood.scale.set(top.a * 1.35, 7.5, 10);
        hood.position.set(0, top.c[1] - 2.5, -top.b - 4.5);
        hood.rotation.x = -Math.PI * 0.62;
        group.add(hood);
        // drawstrings
        const cord = new THREE.MeshStandardMaterial({ color: '#e8e6e1', roughness: 0.7 });
        for (const s of [-1, 1]) group.add(tube([s * 3, top.c[1] - 1, top.b + 1.2], [s * 3.4, top.c[1] - 19, model.rings[2].b + 1.4], 0.32, cord));
      }
      if (model.zip) {
        const zipMat = new THREE.MeshStandardMaterial({ color: '#c9ccd3', metalness: 0.8, roughness: 0.3 });
        const pts = model.rings.slice(0, -1).map(r => new THREE.Vector3(0, r.c[1], r.b + 0.25));
        pts.push(new THREE.Vector3(0, model.hemY, model.rings.at(-1).b + 0.25));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.4, 6), zipMat));
      }
      if (model.pocket) {
        const r = model.rings[4];
        const h = Math.min(18, (model.rings[3].c[1] - model.hemY) * 0.7);
        const pocket = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 24, 1, true, -0.62, 1.24), trimMat);
        pocket.scale.set(r.a + 0.5, 1, r.b + 0.5);
        pocket.position.set(0, model.hemY + 3.5 + h / 2, 0);
        group.add(pocket);
      }
    }
  } else if (model.kind === 'bottom') {
    addLoft(model.seat, model.seatEase, {});
    for (const l of model.legs) addLoft(l.rings, l.ease, {});
  } else if (model.kind === 'shoes') {
    const soleMat = new THREE.MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.55 });
    const upperMat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.6 });
    for (const f of model.feet) {
      const sole = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, model.sole, 32), soleMat);
      sole.scale.set(f.size[0] / 2 + 1.2, 1, f.size[2] / 2 + 1.6);
      sole.position.set(f.c[0], model.sole / 2, f.c[2]);
      const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), upperMat);
      upper.scale.set(f.size[0] / 2 + 0.8, 7.5, f.size[2] / 2 + 1.1);
      upper.position.set(f.c[0], model.sole, f.c[2]);
      group.add(sole, upper);
    }
  }
  const api = {
    group, parts, mat, base,
    paint(mode) {
      for (const p of parts) {
        const col = p.mesh.geometry.getAttribute('color');
        const W = SEG + 1;
        for (let i = 0; i < p.rings.length; i++) {
          const c = mode === 'tension' ? heat(p.ease?.[i] ?? 20, base) : base;
          for (let s = 0; s < W; s++) col.setXYZ(i * W + s, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
      }
      if (!ghost) {
        mat.opacity = mode === 'tension' ? 0.82 : 1; mat.depthWrite = mode !== 'tension';
        // hood/zip/pocket would hide the heat map — tuck them away in tension mode
        for (const o of group.children) if (!parts.some(p => p.mesh === o)) o.visible = mode !== 'tension';
      }
    },
  };
  if (!ghost && parts.length) api.paint('normal');
  return api;
}

// ---------- labels ----------
function makeLabels(stage, overlay, onPick) {
  const items = [];
  const v = new THREE.Vector3();
  stage.tickers.add(() => {
    const w = stage.canvas.clientWidth, h = stage.canvas.clientHeight;
    for (const it of items) {
      v.set(...it.pos).applyMatrix4(it.matrix || new THREE.Matrix4());
      v.project(stage.camera);
      const behind = v.z > 1;
      it.el.style.transform = `translate(-50%, -50%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
      it.el.style.opacity = behind ? 0 : '';
    }
  });
  return {
    add(key, pos, html, status) {
      const el = document.createElement('button');
      el.className = `dim-label s-${status || 'missing'}`;
      el.type = 'button';
      el.textContent = html;
      el.addEventListener('click', e => { e.stopPropagation(); onPick(key); });
      overlay.append(el);
      items.push({ key, pos, el });
      return el;
    },
    clear() { for (const it of items) it.el.remove(); items.length = 0; },
    setActive(key) { for (const it of items) it.el.classList.toggle('active', it.key === key); },
    setVisible(on) { overlay.classList.toggle('labels-off', !on); },
  };
}

function dimMeshes(anchors, statusByKey) {
  const group = new THREE.Group();
  const byKey = {};
  for (const [key, a] of Object.entries(anchors)) {
    const color = STATUS_COLORS[a.assumed ? 'missing' : (statusByKey[key] || 'missing')];
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
    const g = new THREE.Group();
    g.add(tube(a.p1, a.p2, 0.32, mat));
    for (const p of [a.p1, a.p2]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), mat); cap.position.set(...p); g.add(cap); }
    g.renderOrder = 10;
    g.traverse(o => { o.renderOrder = 10; });
    group.add(g);
    byKey[key] = { group: g, mat };
  }
  return { group, byKey };
}

// ---------- public: garment studio ----------
// item: analyzed item; opts.sizeName: initial size; opts.statusFor(sizeName) → {dimKey: status}
export function createFitStudio(container, profile, item, opts = {}) {
  container.classList.add('studio');
  const overlay = document.createElement('div'); overlay.className = 'studio-labels'; container.append(overlay);
  const body = bodyModel(profile);
  const color = colorFor(item.color_considered || item.name, item.category === 'shoes' ? '#f3f3ef' : undefined);
  const sizes = (item.sizes || []).filter(s => s.measurements);
  let sizeName = opts.sizeName ?? sizes[0]?.size;
  const findSize = n => sizes.find(s => String(s.size) === String(n)) || { size: n, measurements: {} };
  let model = garmentModel(item, findSize(sizeName).measurements, profile, body);
  const stage = makeStage(container, { height: opts.height || 440, focusY: model?.focusY ?? 100, distance: model?.kind === 'bottom' ? 300 : model?.kind === 'shoes' ? 170 : 245 });

  const lift = model?.kind === 'shoes' ? model.sole : 0;
  const mannequin = buildBody(body, { lift });
  stage.scene.add(mannequin.group);
  let garment = model ? buildGarment(model, color) : null;
  if (garment) { garment.group.position.y = model.kind === 'shoes' ? 0 : lift; stage.scene.add(garment.group); }

  // ghost reference (e.g. your perfect BTS hoodie)
  let ghost = null;
  if (opts.reference && model && model.kind !== 'shoes') {
    const gm = garmentModel({ ...item, category: opts.reference.category }, opts.reference.measurements, profile, body);
    if (gm && gm.kind === model.kind) { ghost = buildGarment(gm, '#5eead4', { ghost: true }); ghost.group.visible = false; stage.scene.add(ghost.group); }
  }

  let active = null, mode = 'normal';
  let dims = null;
  const labels = makeLabels(stage, overlay, key => select(key));
  const drawDims = () => {
    if (dims) { stage.scene.remove(dims.group); dims.group.traverse(o => o.geometry?.dispose?.()); }
    labels.clear();
    if (!model) return;
    const status = opts.statusFor?.(sizeName) || {};
    dims = dimMeshes(model.anchors, status);
    dims.group.position.y = model.kind === 'shoes' ? 0 : lift;
    stage.scene.add(dims.group);
    for (const [key, a] of Object.entries(model.anchors)) {
      const mid = (a.lp || a.p1.map((v, i) => (v + a.p2[i]) / 2)).map((v, i) => v + (i === 1 ? lift : 0));
      labels.add(key, mid, `${a.label} ${a.value}${a.assumed ? '?' : ''}`, a.assumed ? 'missing' : status[key]);
    }
    if (active) select(active, { silent: true });
  };
  drawDims();

  function select(key, { silent = false } = {}) {
    active = key;
    labels.setActive(key);
    if (dims) for (const [k, d] of Object.entries(dims.byKey)) d.mat.opacity = !key || k === key ? 0.95 : 0.18;
    const a = model?.anchors?.[key];
    if (!silent) stage.pause(12000);
    if (a && !silent) stage.focus(a.p1.map((v, i) => (v + a.p2[i]) / 2 + (i === 1 ? lift : 0)));
    if (!silent) opts.onSelect?.(key, a ? { ...a, size: sizeName } : null);
  }

  // morph between sizes: same topology → lerp vertex positions
  let morph = null;
  stage.tickers.add(t => {
    if (!morph) return;
    const k = Math.min(1, (t - morph.t0) / 520);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    for (const m of morph.parts) {
      const arr = m.attr.array;
      for (let i = 0; i < arr.length; i++) arr[i] = m.from[i] + (m.to[i] - m.from[i]) * e;
      m.attr.needsUpdate = true;
      m.geo.computeVertexNormals();
    }
    if (k >= 1) morph = null;
  });

  function setSize(name) {
    if (!model || model.kind === 'shoes') return;
    sizeName = name;
    const next = garmentModel(item, findSize(name).measurements, profile, body);
    const sameShape = garment && next.kind === model.kind && garment.parts.length === (next.kind === 'top' ? 1 + next.sleeves.length : 1 + next.legs.length);
    if (sameShape) {
      const ringSets = next.kind === 'top' ? [next.rings, ...next.sleeves.map(s => s.rings)] : [next.seat, ...next.legs.map(l => l.rings)];
      const easeSets = next.kind === 'top' ? [next.ease, ...next.sleeves.map(s => s.rings.map(() => 20))] : [next.seatEase, ...next.legs.map(l => l.ease)];
      morph = { t0: performance.now(), parts: garment.parts.map((p, i) => {
        const attr = p.mesh.geometry.getAttribute('position');
        p.rings = ringSets[i]; p.ease = easeSets[i];
        return { attr, geo: p.mesh.geometry, from: Float32Array.from(attr.array), to: loftPositions(ringSets[i], p.opts) };
      }) };
      // details (hood, zip, pocket) are rebuilt — cheap and they follow the new rings
      stage.scene.remove(garment.group);
      const fresh = buildGarment(next, color);
      fresh.parts.forEach((p, i) => { p.mesh.geometry.dispose(); p.mesh.geometry = garment.parts[i].mesh.geometry; p.rings = ringSets[i]; p.ease = easeSets[i]; });
      fresh.group.position.y = lift;
      garment = fresh;
      stage.scene.add(garment.group);
      garment.paint(mode);
    }
    model = next;
    drawDims();
  }

  function setMode(m) { mode = m; garment?.paint(m); }
  function toggleGhost(on) { if (ghost) ghost.group.visible = on; }
  function toggleLabels(on) { labels.setVisible(on); if (dims) dims.group.visible = on; }
  function update(newItem) {
    // live preview (manual entry): rebuild garment for current size
    item = newItem;
    const s = (item.sizes || []).find(x => String(x.size) === String(sizeName)) || item.sizes?.[0];
    if (!s) return;
    sizes.length = 0; sizes.push(...(item.sizes || []));
    setSize(s.size);
  }

  return { setSize, setMode, toggleGhost, toggleLabels, select, update, pause: stage.pause, hasGhost: !!ghost, dispose: stage.dispose, model: () => model };
}

// ---------- public: body viewer ----------
export function createBodyViewer(container, profile, opts = {}) {
  container.classList.add('studio');
  const overlay = document.createElement('div'); overlay.className = 'studio-labels'; container.append(overlay);
  const body = bodyModel(profile);
  const stage = makeStage(container, { height: opts.height || 460, focusY: body.H * 0.52, distance: 380 });
  stage.scene.add(buildBody(body).group);
  const anchors = bodyAnchors(body);
  const meshes = {};
  const labels = makeLabels(stage, overlay, key => select(key));
  for (const a of anchors) {
    const mat = new THREE.MeshBasicMaterial({ color: '#7c9cff', transparent: true, opacity: 0.9, depthTest: false });
    let mesh, mid;
    if (a.type === 'ring') {
      const c = a.c || [0, a.y, 0];
      mesh = ellipseRing(c, a.a + 0.6, a.b + 0.6, a.axis, 0.4, mat);
      mid = a.lp || [c[0] + (a.a + 3), c[1], c[2] + 1];
    } else {
      mesh = tube(a.p1, a.p2, 0.4, mat);
      mid = a.lp || a.p1.map((v, i) => (v + a.p2[i]) / 2);
    }
    mesh.renderOrder = 10;
    stage.scene.add(mesh);
    meshes[a.key] = mat;
    labels.add(a.key, mid, `${a.label} ${a.value}`, 'body');
  }
  function select(key) {
    stage.pause(12000);
    labels.setActive(key);
    for (const [k, m] of Object.entries(meshes)) { m.color.set(k === key ? '#5eead4' : '#7c9cff'); m.opacity = !key || k === key ? 0.95 : 0.3; }
    const a = anchors.find(x => x.key === key);
    if (a) {
      const p = a.type === 'ring' ? (a.c || [0, a.y, 0]) : a.p1.map((v, i) => (v + a.p2[i]) / 2);
      stage.focus(p, key === 'heightCm' ? 380 : 230);
    }
    opts.onSelect?.(key, a);
  }
  return { select, dispose: stage.dispose };
}
