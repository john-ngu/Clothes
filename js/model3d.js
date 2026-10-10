// Pure geometry for the 3D Fit Studio: turns body measurements and garment
// size-chart numbers into ring "slices" (center, half-width, half-depth) and
// dimension anchor points. No three.js here, so it is unit-testable in Node.
// Units: centimeters, y up, +z = front, floor at y = 0.

import { deriveMeasurements, CATEGORIES } from './fit.js';

const mid = v => Array.isArray(v) ? (Number(v[0]) + Number(v[1] ?? v[0])) / 2 : Number(v);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Half-width a of an ellipse with circumference C and depth ratio r = b/a (Ramanujan).
export function ellipseFromCirc(C, r) {
  const h = ((1 - r) / (1 + r)) ** 2;
  const factor = Math.PI * (1 + r) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  const a = C / factor;
  return { a, b: a * r };
}
export function ellipsePerimeter(a, b) {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

// ---------------- body ----------------
export function bodyModel(profile) {
  const b = profile.body || {};
  const H = mid(b.heightCm) || 171.5;
  const chest = mid(b.chest) || 99, waist = mid(b.waist) || 85, hips = mid(b.hips) || 93;
  const shoulder = mid(b.shoulder) || 51, neck = mid(b.neck) || 38;
  const biceps = mid(b.biceps) || 35, thigh = mid(b.thigh) || 58.5, calf = mid(b.calf) || 41.5;
  const wrist = mid(b.wrist) || 17, armLen = mid(b.armLength) || 60;
  const inseam = mid(b.inseamCm) || 71;
  const y = {
    top: H, headC: H - 11.5, neckTop: H * 0.87, hps: H * 0.818, shoulder: H * 0.805,
    armpit: H * 0.745, chest: H * 0.72, waist: H * 0.61, hips: H * 0.515, crotch: H * 0.46,
    knee: H * 0.285, calf: H * 0.2, ankle: H * 0.045,
  };
  y.upperHip = lerp(y.hips, y.waist, 0.35);
  const neckR = neck / (2 * Math.PI);
  const ring = (yy, C, r) => ({ c: [0, yy, 0], ...ellipseFromCirc(C, r) });
  const hipsE = ellipseFromCirc(hips, 0.78);
  const chestE = ellipseFromCirc(chest, 0.66);
  const torso = [
    { c: [0, y.crotch + 1, 0], a: hipsE.a * 0.8, b: hipsE.b * 0.78 },
    ring(y.hips, hips, 0.78),
    ring(lerp(y.hips, y.waist, 0.5), (hips + waist) / 2, 0.76),
    ring(y.waist, waist, 0.74),
    ring(y.chest, chest, 0.66),
    ring(y.armpit, chest * 1.01, 0.62),
    { c: [0, y.shoulder - 2, 0], a: shoulder / 2 - 4.5, b: chestE.b * 0.8 },
    { c: [0, y.hps - 1, 0], a: neckR * 1.9, b: neckR * 1.55 },
    { c: [0, y.hps + 1.5, 0], a: neckR * 1.05, b: neckR * 1.05 },
  ];
  // Arm hangs in a relaxed A-pose, 12° out from vertical.
  const ang = (12 * Math.PI) / 180;
  const arm = (side) => {
    const joint = [side * (shoulder / 2 - 5), y.shoulder - 3, 0];
    const dir = [side * Math.sin(ang), -Math.cos(ang), 0];
    const rings = [
      [0, 6.2], [8, biceps / (2 * Math.PI)], [armLen * 0.43, biceps / (2 * Math.PI) * 0.8],
      [armLen * 0.55, 4.6], [armLen * 0.97, wrist / (2 * Math.PI)],
    ].map(([t, r]) => ({ t, r }));
    return { joint, dir, length: armLen, rings };
  };
  const leg = (side) => {
    const xTop = side * 9.5, xBot = side * 8.2;
    const at = (yy, r) => ({ c: [lerp(xBot, xTop, (yy - y.ankle) / (y.hips - y.ankle)), yy, 0], a: r, b: r });
    return [
      at(y.hips - 2, thigh / (2 * Math.PI) * 1.05),
      at(y.crotch, thigh / (2 * Math.PI)),
      at(lerp(y.crotch, y.knee, 0.5), thigh / (2 * Math.PI) * 0.82),
      at(y.knee, 6.0),
      at(y.calf, calf / (2 * Math.PI)),
      at(y.ankle + 4, 3.9),
      at(y.ankle, 3.6),
    ];
  };
  return {
    H, y, neckR, torso, arms: [arm(-1), arm(1)], legs: [leg(-1), leg(1)],
    head: { c: [0, y.headC, 1], r: [8.2, 11, 9.8] },
    neck: { r: neckR, y0: y.hps - 2, y1: y.neckTop + 1 },
    feet: [-1, 1].map(s => ({ c: [s * 8.4, 3.5, 5], size: [9.5, 7, 26] })),
    m: { chest, waist, hips, shoulder, neck, biceps, thigh, calf, wrist, armLen, inseam },
  };
}

// Torso half-width/depth at height yy (0 outside the torso).
export function torsoAt(body, yy) {
  const r = body.torso;
  if (yy < r[0].c[1]) {
    // below the torso: two legs side by side act as the "body" for long tops
    const legA = legAt(body, 1, yy);
    return legA ? { a: 9.5 + legA, b: legA } : { a: 0, b: 0 };
  }
  for (let i = 0; i < r.length - 1; i++) {
    if (yy >= r[i].c[1] && yy <= r[i + 1].c[1]) {
      const t = (yy - r[i].c[1]) / (r[i + 1].c[1] - r[i].c[1]);
      return { a: lerp(r[i].a, r[i + 1].a, t), b: lerp(r[i].b, r[i + 1].b, t) };
    }
  }
  return { a: body.neckR, b: body.neckR };
}
export function legAt(body, side, yy) {
  const rings = body.legs[side > 0 ? 1 : 0];
  for (let i = 0; i < rings.length - 1; i++) {
    const y0 = rings[i].c[1], y1 = rings[i + 1].c[1];
    if (yy <= y0 && yy >= y1) return lerp(rings[i].a, rings[i + 1].a, (y0 - yy) / (y0 - y1));
  }
  return yy > rings[0].c[1] ? rings[0].a : 0;
}
export function armRadiusAt(arm, t) {
  const r = arm.rings;
  if (t <= 0) return r[0].r;
  for (let i = 0; i < r.length - 1; i++) {
    if (t >= r[i].t && t <= r[i + 1].t) return lerp(r[i].r, r[i + 1].r, (t - r[i].t) / (r[i + 1].t - r[i].t));
  }
  return t <= arm.length + 8 ? 3.2 : 0; // hand, then nothing
}

// ---------------- garments ----------------
const RIBBED = new Set(['hoodie', 'jacket']);

// Fill in missing measurements with the middle of the user's targets so a
// garment can still be drawn; those dims are flagged as "assumed".
function withDefaults(category, raw, profile) {
  const m = deriveMeasurements(raw || {});
  const spec = profile.ideals?.[category] || {};
  const assumed = new Set();
  const want = CATEGORIES[category]?.group === 'bottom'
    ? ['waistFlat', 'hipFlat', 'thighFlat', 'inseam', 'legOpeningFlat']
    : ['chestFlat', 'length', 'shoulder', 'reach', 'bicepFlat'];
  const fallback = {
    chestFlat: 58, length: 68, shoulder: 48, reach: 84, bicepFlat: 21,
    waistFlat: 42.5, hipFlat: 53, thighFlat: 34, inseam: 72, legOpeningFlat: 22,
  };
  if (category === 'tshirt' || category === 'scrub_top') fallback.reach = (m.shoulder ?? 50) / 2 + 22;
  if (category === 'shorts') fallback.inseam = 17;
  for (const k of want) {
    if (m[k] == null) {
      m[k] = spec[k] ? (spec[k].ideal[0] + spec[k].ideal[1]) / 2 : fallback[k];
      assumed.add(k);
    }
  }
  return { m, assumed };
}

// Calibration: where a perfect reference top's hem lands is where the user says
// it lands (upper hip). Flat chart length → vertical drop on the body.
function topLengthScale(profile, body) {
  const ref = (profile.references || []).find(r => r.outcome === 'perfect' && CATEGORIES[r.category]?.group === 'top' && r.measurements?.length);
  const refLen = ref ? Number(ref.measurements.length) : 67;
  return (body.y.hps - body.y.upperHip) / refLen;
}
// Pants: the middle of the preferred inseam lands just at the ankle bone.
function inseamScale(profile, body) {
  const ins = profile.ideals?.casual_pants?.inseam?.ideal || [70, 74];
  return (body.y.crotch - (body.y.ankle + 3)) / ((ins[0] + ins[1]) / 2);
}

export function garmentModel(item, sizeMeasurements, profile, body = bodyModel(profile)) {
  const category = CATEGORIES[item.category] ? item.category : 'other';
  const group = CATEGORIES[category].group;
  if (group === 'top') return topModel(category, item, sizeMeasurements, profile, body);
  if (group === 'bottom') return bottomModel(category, item, sizeMeasurements, profile, body);
  if (group === 'shoes') return shoeModel(item, body);
  return null;
}

function ensureOver(ring, under, gap) {
  return { ...ring, a: Math.max(ring.a, under.a + gap), b: Math.max(ring.b, under.b + gap) };
}

function topModel(category, item, raw, profile, body) {
  const { m, assumed } = withDefaults(category, raw, profile);
  const y = body.y;
  const k = topLengthScale(profile, body);
  const hemY = y.hps - m.length * k;
  const chestE = ellipseFromCirc(m.chestFlat * 2, 0.64);
  const boxy = category === 'hoodie' || category === 'jacket' ? 1.0 : category === 'longsleeve' ? 0.94 : 0.98;
  const ribbed = RIBBED.has(category);
  const S = m.shoulder;
  const ys = [y.hps + 0.5, y.shoulder - 0.5, y.armpit, lerp(y.armpit, hemY, 0.45), hemY + 3, hemY];
  let rings = [
    { c: [0, ys[0], 0], a: body.neckR + 2.4, b: body.neckR + 2.2 },
    { c: [0, ys[1], 0], a: Math.max(S / 2 - 2.5, 8), b: chestE.b * 0.92 },
    { c: [0, ys[2], 0], a: chestE.a, b: chestE.b },
    { c: [0, ys[3], 0], a: chestE.a * boxy, b: chestE.b * boxy },
    { c: [0, ys[4], 0], a: chestE.a * boxy * (ribbed ? 0.97 : 1), b: chestE.b * boxy * (ribbed ? 0.97 : 1) },
    { c: [0, ys[5], 0], a: chestE.a * boxy * (ribbed ? 0.9 : 1), b: chestE.b * boxy * (ribbed ? 0.9 : 1) },
  ];
  rings = rings.map(r => ensureOver(r, torsoAt(body, r.c[1]), 0.7));
  // Ease = garment girth minus body girth at each ring (for the tension heat map).
  const ease = rings.map(r => { const t = torsoAt(body, r.c[1]); return t.a ? ellipsePerimeter(r.a, r.b) - ellipsePerimeter(t.a, t.b) : 30; });
  ease[0] = 20; // the neckline hugs the neck by design — don't flag it

  const sleeves = body.arms.map((arm, i) => {
    const side = i === 0 ? -1 : 1;
    const jx = Math.abs(arm.joint[0]);
    // Seam sits at the garment's shoulder point (dropped shoulders slope down a little),
    // and the sleeve runs from there toward the wrist.
    const seam = [side * S / 2, y.shoulder - 0.35 * Math.max(0, S / 2 - jx) - 1, 0];
    const wristP = arm.joint.map((v, j) => v + arm.dir[j] * arm.length);
    const toWrist = wristP.map((v, j) => v - seam[j]);
    const tl = Math.hypot(...toWrist);
    const sleeveLen = Math.max(8, m.reach - S / 2);
    // where the cuff ends (sleeve runs from the seam toward the wrist)
    const end = seam.map((v, j) => v + toWrist[j] / tl * sleeveLen);
    // draw the tube from just under the deltoid so it hugs the arm instead of jutting out
    const start = arm.joint.map((v, j) => v + arm.dir[j] * 3);
    start[1] = Math.min(start[1], seam[1]);
    const dv = end.map((v, j) => v - start[j]);
    const dl = Math.hypot(...dv);
    const dir = dv.map(v => v / dl);
    const bicepR = m.bicepFlat / Math.PI;
    const short = sleeveLen < 30;
    const fr = [0, 0.35, 0.8, 1];
    const want = [
      Math.max(bicepR * 1.18, 9),
      bicepR,
      short ? bicepR * 0.98 : lerp(bicepR, 4.4, 0.75),
      short ? bicepR * 0.97 : ribbed || category === 'longsleeve' ? 3.7 : 4.6,
    ];
    const sRings = fr.map((f, j) => {
      const c = start.map((v, q) => v + dir[q] * dl * f);
      // keep the arm inside: radius ≥ distance from arm axis + arm radius
      const rel = c.map((v, q) => v - arm.joint[q]);
      const tArm = rel[0] * arm.dir[0] + rel[1] * arm.dir[1];
      const off = Math.hypot(rel[0] - arm.dir[0] * tArm, rel[1] - arm.dir[1] * tArm);
      const armR = armRadiusAt(arm, tArm);
      const r = Math.max(want[j], armR > 0 ? off + armR + 0.5 : 0);
      return { c, a: r, b: r * 0.92, axis: dir };
    });
    return { rings: sRings, dir, side, sleeveLen };
  });

  const name = `${item.name || ''} ${item.closure || ''} ${item.notes || ''}`.toLowerCase();
  const zip = /zip/.test(name) || category === 'jacket';
  const hood = category === 'hoodie' && !/crew|sweatshirt|pullover crew/.test(name) || /hood/.test(name);
  const torsoA = Math.max(...rings.map(r => r.a));

  const anchors = {
    chestFlat: line([-rings[2].a, y.armpit - 2, rings[2].b + 1.8], [rings[2].a, y.armpit - 2, rings[2].b + 1.8], 'Chest', m.chestFlat, assumed.has('chestFlat')),
    length: line([-(torsoA + 5), y.hps, 0], [-(torsoA + 5), hemY, 0], 'Length', m.length, assumed.has('length')),
    shoulder: line([-S / 2, ys[1] + 3.5, -2], [S / 2, ys[1] + 3.5, -2], 'Shoulder', m.shoulder, assumed.has('shoulder')),
  };
  const sv = sleeves[1];
  const out = [sv.dir[1], -sv.dir[0], 0].map(v => -v); // outward normal of the right sleeve
  const off = (p, d) => p.map((v, j) => v + out[j] * d);
  anchors.reach = line(off(sv.rings[0].c, sv.rings[0].a + 1.5), off(sv.rings[3].c, sv.rings[3].a + 1.5), 'Sleeve', +(m.reach - m.shoulder / 2).toFixed(1), assumed.has('reach'), `seam→cuff (${m.reach.toFixed(1)} from center back)`);
  const bc = sv.rings[1];
  anchors.length.lp = [-(torsoA + 5), lerp(hemY, y.hps, 0.2), 0];
  anchors.reach.lp = off(sv.rings[0].c.map((v, j) => lerp(v, sv.rings[3].c[j], 0.78)), sv.rings[2].a + 2);
  anchors.bicepFlat = line(
    [bc.c[0] - bc.a * Math.abs(sv.dir[1]), bc.c[1] - bc.a * Math.abs(sv.dir[0]), bc.b + 1],
    [bc.c[0] + bc.a * Math.abs(sv.dir[1]), bc.c[1] + bc.a * Math.abs(sv.dir[0]), bc.b + 1],
    'Bicep', m.bicepFlat, assumed.has('bicepFlat'));

  return {
    kind: 'top', category, rings, ease, sleeves, hood, zip, ribbed,
    pocket: category === 'hoodie', hemY, anchors, assumed: [...assumed], focusY: lerp(y.hps, hemY, 0.45),
  };
}

function bottomModel(category, item, raw, profile, body) {
  const { m, assumed } = withDefaults(category, raw, profile);
  const y = body.y;
  const elastic = item.waist_type === 'elastic' || item.waist_type === 'drawstring';
  const waistY = lerp(y.hips, y.waist, 0.5); // mid-rise: between natural waist and hips
  const bodyW = torsoAt(body, waistY);
  const waistE = elastic
    ? { a: bodyW.a + 1.2, b: bodyW.b + 1.2 }
    : ellipseFromCirc(m.waistFlat * 2, 0.78);
  const hipE = ellipseFromCirc(m.hipFlat * 2, 0.8);
  let seat = [
    { c: [0, waistY + 4, 0], a: waistE.a, b: waistE.b },
    { c: [0, waistY, 0], a: waistE.a, b: waistE.b },
    { c: [0, y.hips, 0], a: hipE.a, b: hipE.b },
    { c: [0, y.crotch + 3, 0], a: hipE.a * 0.96, b: hipE.b * 0.92 },
  ].map(r => ensureOver(r, torsoAt(body, r.c[1]), 0.5));
  const seatEase = seat.map(r => { const t = torsoAt(body, r.c[1]); return ellipsePerimeter(r.a, r.b) - ellipsePerimeter(t.a, t.b); });

  const kp = inseamScale(profile, body);
  const rawHem = y.crotch - m.inseam * kp;
  // Anything below the top of the shoe breaks/stacks; the hem can't go below the floor.
  const shoeTop = y.ankle - 1;
  const stack = Math.max(0, shoeTop - rawHem);
  const hemY = Math.max(rawHem, 1.2);
  const thighR = m.thighFlat / Math.PI;
  const hemR = m.legOpeningFlat / Math.PI;
  const legs = [-1, 1].map(side => {
    const xTop = side * seat[3].a * 0.47;
    const xHem = side * Math.max(8.2, Math.abs(xTop) * 0.95);
    const top = y.crotch + 6;
    const ys = [top, y.crotch - 4, lerp(y.crotch, y.knee, 0.55), y.knee, lerp(y.knee, hemY, 0.6), hemY + 2, hemY];
    const rad = [thighR * 1.05, thighR, lerp(thighR, hemR, 0.35), lerp(thighR, hemR, 0.55), lerp(thighR, hemR, 0.85), hemR, hemR];
    const rings = ys.map((yy, j) => {
      const t = (top - yy) / (top - hemY);
      const under = legAt(body, side, yy);
      // Stacking: fabric bunches into ripples just above the floor.
      const ripple = j >= 4 && stack > 0 ? 1 + Math.min(0.25, stack / 40) * (j % 2 ? 1 : 0.6) : 1;
      const r = Math.max(rad[j] * ripple, under + 0.4);
      return { c: [lerp(xTop, xHem, clamp(t, 0, 1)), yy, 0], a: r, b: r * 0.96 };
    });
    const ease = rings.map(r => 2 * Math.PI * (r.a - Math.max(legAt(body, side, r.c[1]), 0.01)));
    return { rings, ease, side };
  });
  const L = legs[0].rings; // left leg for annotations
  const front = r => r.b + 1.5;
  const shortsLike = category === 'shorts';
  const anchors = {
    waistFlat: line([-seat[1].a, waistY, front(seat[1])], [seat[1].a, waistY, front(seat[1])], 'Waist', m.waistFlat, assumed.has('waistFlat'), elastic ? 'elastic — relaxed' : ''),
    hipFlat: line([-seat[2].a, y.hips, front(seat[2])], [seat[2].a, y.hips, front(seat[2])], 'Hip', m.hipFlat, assumed.has('hipFlat')),
    thighFlat: line([L[1].c[0] - L[1].a, L[1].c[1], front(L[1])], [L[1].c[0] + L[1].a, L[1].c[1], front(L[1])], 'Thigh', m.thighFlat, assumed.has('thighFlat')),
    inseam: line([L[0].c[0] + L[0].a * 0.6, y.crotch, 2], [L[6].c[0] + L[6].a, hemY, 2], 'Inseam', m.inseam, assumed.has('inseam'), stack > 0 ? `≈${stack.toFixed(0)} cm would stack` : ''),
    legOpeningFlat: line([L[6].c[0] - L[6].a, hemY + 0.5, front(L[6])], [L[6].c[0] + L[6].a, hemY + 0.5, front(L[6])], shortsLike ? 'Leg opening' : 'Hem', m.legOpeningFlat, assumed.has('legOpeningFlat')),
  };
  anchors.waistFlat.lp = [seat[1].a + 4, waistY + 3, front(seat[1])];
  anchors.hipFlat.lp = [-(seat[2].a + 4), y.hips, front(seat[2])];
  anchors.inseam.lp = [L[0].c[0] + 2, lerp(y.crotch, hemY, 0.55), 6];
  return { kind: 'bottom', category, seat, seatEase, legs, hemY, stack, anchors, assumed: [...assumed], focusY: lerp(waistY, hemY, 0.45) };
}

function shoeModel(item, body) {
  const stackMM = Number(item.shoe?.stack_height_mm) || 30;
  const sole = stackMM / 10;
  return {
    kind: 'shoes', sole, feet: body.feet,
    anchors: { stack: line([22, 0, 14], [22, sole, 14], 'Stack', +(stackMM / 10).toFixed(1), !item.shoe?.stack_height_mm, `${stackMM} mm — you'd stand ~${(sole * 0.7).toFixed(1)} cm taller`) },
    focusY: 20,
  };
}

function line(p1, p2, label, value, assumed = false, note = '') {
  return { p1, p2, label, value: Math.round(value * 10) / 10, assumed, note };
}

// Body-measurement anchors for the profile viewer.
export function bodyAnchors(body) {
  const y = body.y, m = body.m;
  const ringAt = (yy, label, value, key) => ({ key, type: 'ring', y: yy, ...torsoAt(body, yy), label, value });
  const rArm = body.arms[1];
  const armP = t => rArm.joint.map((v, j) => v + rArm.dir[j] * t);
  const legR = legAt(body, -1, y.crotch - 3);
  const leftLeg = body.legs[0];
  const armMid = armP(rArm.length * 0.55);
  const T = yy => torsoAt(body, yy);
  return [
    { key: 'heightCm', type: 'line', p1: [-34, 0, 0], p2: [-34, body.H, 0], lp: [-34, body.H * 0.9, 0], label: 'Height', value: Math.round(body.H * 10) / 10 },
    { key: 'shoulder', type: 'line', p1: [-m.shoulder / 2, y.shoulder + 4, -3], p2: [m.shoulder / 2, y.shoulder + 4, -3], lp: [-m.shoulder / 2 - 4, y.shoulder + 6, -3], label: 'Shoulders', value: m.shoulder },
    { key: 'neck', type: 'ring', y: y.hps + 3, a: body.neckR + 0.4, b: body.neckR + 0.4, lp: [body.neckR + 8, y.hps + 7, 0], label: 'Neck', value: m.neck },
    { ...ringAt(y.chest, 'Chest', m.chest, 'chest'), lp: [-(T(y.chest).a + 5), y.chest, 2] },
    { ...ringAt(y.waist, 'Waist', m.waist, 'waist'), lp: [-(T(y.waist).a + 5), y.waist, 2] },
    { ...ringAt(y.hips, 'Hips', m.hips, 'hips'), lp: [-(T(y.hips).a + 5), y.hips, 2] },
    { key: 'biceps', type: 'ring', c: armP(8), axis: rArm.dir, a: armRadiusAt(rArm, 8) + 0.4, b: armRadiusAt(rArm, 8) + 0.4, lp: armP(8).map((v, j) => v + [11, 0, 0][j]), label: 'Biceps', value: m.biceps },
    { key: 'wrist', type: 'ring', c: armP(rArm.length * 0.97), axis: rArm.dir, a: 3.1, b: 3.1, lp: armP(rArm.length * 0.97).map((v, j) => v + [9, 0, 0][j]), label: 'Wrist', value: m.wrist },
    { key: 'armLength', type: 'line', p1: armP(0).map((v, j) => v + [6, 0, 0][j]), p2: armP(rArm.length).map((v, j) => v + [6, 0, 0][j]), lp: armMid.map((v, j) => v + [13, 0, 0][j]), label: 'Arm', value: m.armLen },
    { key: 'thigh', type: 'ring', c: [leftLeg[1].c[0], y.crotch - 3, 0], a: legR + 0.4, b: legR + 0.4, lp: [leftLeg[1].c[0] - legR - 6, y.crotch - 3, 2], label: 'Thigh', value: m.thigh },
    { key: 'calf', type: 'ring', c: [leftLeg[4].c[0], y.calf, 0], a: leftLeg[4].a + 0.4, b: leftLeg[4].a + 0.4, lp: [leftLeg[4].c[0] - leftLeg[4].a - 6, y.calf, 2], label: 'Calf', value: m.calf },
    { key: 'inseamCm', type: 'line', p1: [-2, y.crotch, 4], p2: [-4, 2, 4], lp: [4, y.crotch * 0.45, 8], label: 'Inseam', value: m.inseam },
  ];
}
