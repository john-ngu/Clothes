// Fit engine: compares garment measurements (cm) against the ideal ranges in
// the profile and turns them into per-size scores, explanations, and a verdict.
// Pure functions only — no DOM, no network — so it can be unit-tested in Node.

export const CATEGORIES = {
  hoodie:      { label: 'Hoodie / sweatshirt / zip-up', group: 'top' },
  tshirt:      { label: 'T-shirt / tank / cutoff',      group: 'top' },
  longsleeve:  { label: 'Henley / thermal / long sleeve', group: 'top' },
  jacket:      { label: 'Jacket / blouson / outerwear', group: 'top' },
  scrub_top:   { label: 'Scrub top',                     group: 'top' },
  casual_pants:{ label: 'Casual pants (straight / wide)', group: 'bottom' },
  dress_pants: { label: 'Dress / smart-casual trousers', group: 'bottom' },
  sweatpants:  { label: 'Athletic sweatpants',           group: 'bottom' },
  shorts:      { label: 'Shorts',                        group: 'bottom' },
  scrub_pants: { label: 'Scrub pants',                   group: 'bottom' },
  shoes:       { label: 'Shoes',                         group: 'shoes' },
  other:       { label: 'Other / accessory',             group: 'other' },
};

export const DIMS = {
  chestFlat:      { label: 'Chest (pit to pit, flat)' },
  length:         { label: 'Body length' },
  shoulder:       { label: 'Shoulder width' },
  reach:          { label: 'Sleeve reach (center back → cuff)' },
  bicepFlat:      { label: 'Bicep / sleeve width (flat)' },
  waistFlat:      { label: 'Waist (flat)' },
  hipFlat:        { label: 'Hip (flat)' },
  thighFlat:      { label: 'Thigh (flat)' },
  inseam:         { label: 'Inseam' },
  legOpeningFlat: { label: 'Leg opening (flat)' },
};

// What "too low" / "too high" means for each dimension, in plain words.
const DIRECTION_TEXT = {
  chestFlat:      { low: 'slimmer through the body than your target — less relaxed/boxy', high: 'very roomy in the body — risks a balloon / swallowed look' },
  length:         { low: 'on the cropped side', high: 'long — will hang past your upper hip and shorten your legs' },
  shoulder:       { low: 'narrow for your 51 cm shoulders — may pull across the back', high: 'very dropped shoulder — can look sloppy on a 5\'7"–5\'8" frame' },
  reach:          { low: 'sleeves may end short of the wrist', high: 'sleeves long — will bunch at the cuff' },
  bicepFlat:      { low: 'tight on your 34–36 cm biceps', high: 'wide sleeves — loose, boxy arm' },
  waistFlat:      { low: 'tight at the waist', high: 'loose at the waist — will need a belt or drawcord' },
  hipFlat:        { low: 'tight through the seat', high: 'roomy through the seat' },
  thighFlat:      { low: 'tight on your 58–59 cm thighs', high: 'very wide thigh — can look baggy' },
  inseam:         { low: 'short — will look cropped / high-water', high: 'long — will stack at the ankle unless hemmed' },
  legOpeningFlat: { low: 'tapered / narrow at the ankle', high: 'wide at the hem — extra fabric at the bottom, flared look' },
};

export const VERDICTS = [
  { min: 88, key: 'perfect', label: 'Perfect for you' },
  { min: 76, key: 'great',   label: 'Great fit' },
  { min: 62, key: 'okay',    label: 'Workable, with caveats' },
  { min: 0,  key: 'skip',    label: 'Skip it' },
];

export function verdictFor(score) {
  if (score == null || Number.isNaN(score)) return { key: 'unknown', label: 'Not enough info' };
  return VERDICTS.find(v => score >= v.min);
}

const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? null : Number(v);
const round1 = v => Math.round(v * 10) / 10;

// Score a single value against an ideal range and an acceptable range.
// Inside ideal → 100. Between ideal and acceptable edge → 100..65.
// Beyond acceptable → falls from 65 to 0 over a further span.
export function scoreValue(value, ideal, ok) {
  const [iLo, iHi] = ideal;
  const [oLo, oHi] = ok;
  if (value >= iLo && value <= iHi) return { score: 100, status: 'ideal', side: null };
  const low = value < iLo;
  const edgeIdeal = low ? iLo : iHi;
  const edgeOk = low ? oLo : oHi;
  const span = Math.max(Math.abs(edgeIdeal - edgeOk), 0.5);
  const dist = Math.abs(value - edgeIdeal);
  if (dist <= span) {
    return { score: 100 - 35 * (dist / span), status: 'ok', side: low ? 'low' : 'high' };
  }
  const beyond = dist - span;
  const fallSpan = Math.max(span * 1.5, 3);
  return { score: Math.max(0, 65 - 65 * (beyond / fallSpan)), status: 'off', side: low ? 'low' : 'high' };
}

// Derive the comparable dimensions from raw garment measurements.
export function deriveMeasurements(raw = {}) {
  const m = {};
  for (const k of ['chestFlat', 'length', 'shoulder', 'bicepFlat', 'waistFlat', 'hipFlat', 'thighFlat', 'inseam', 'legOpeningFlat']) {
    const v = num(raw[k]);
    if (v != null) m[k] = v;
  }
  const cb = num(raw.sleeveCB);
  const sleeve = num(raw.sleeve);
  if (cb != null) m.reach = cb;
  else if (sleeve != null && m.shoulder != null) m.reach = round1(m.shoulder / 2 + sleeve);
  return m;
}

function rangeText(r, unit = 'cm') {
  return `${r[0]}–${r[1]} ${unit}`;
}

// Elastic / drawstring waists stretch, so their relaxed flat measurement is
// judged on a looser scale.
function idealsFor(category, profile, waistType) {
  const base = (profile.ideals && profile.ideals[category]) || {};
  const out = {};
  for (const [k, v] of Object.entries(base)) out[k] = { ...v };
  if (out.waistFlat && (waistType === 'elastic' || waistType === 'drawstring')) {
    out.waistFlat = { ...out.waistFlat, ideal: [34, 44], ok: [32, 46.5], note: 'elastic waist — relaxed measurement, it stretches' };
  }
  return out;
}

// Score one size's garment measurements.
export function scoreGarmentSize(category, rawMeasurements, profile, opts = {}) {
  const ideals = idealsFor(category, profile, opts.waistType);
  const m = deriveMeasurements(rawMeasurements);
  const dims = [];
  let wSum = 0, wTotal = 0, sSum = 0;
  for (const [key, spec] of Object.entries(ideals)) {
    const w = spec.weight ?? 1;
    wTotal += w;
    const value = m[key];
    if (value == null) {
      dims.push({ key, label: DIMS[key]?.label || key, value: null, ideal: spec.ideal, ok: spec.ok, score: null, status: 'missing', message: 'not listed' });
      continue;
    }
    const r = scoreValue(value, spec.ideal, spec.ok);
    wSum += w;
    sSum += r.score * w;
    let message;
    if (r.status === 'ideal') message = `${value} cm — inside your ${rangeText(spec.ideal)} sweet spot`;
    else {
      const edge = r.side === 'low' ? spec.ideal[0] : spec.ideal[1];
      const diff = round1(value - edge);
      message = `${value} cm (${diff > 0 ? '+' : ''}${diff} vs ideal) — ${DIRECTION_TEXT[key]?.[r.side] || (r.side === 'low' ? 'small' : 'large')}`;
    }
    if (spec.note) message += ` · ${spec.note}`;
    dims.push({ key, label: DIMS[key]?.label || key, value, ideal: spec.ideal, ok: spec.ok, score: Math.round(r.score), status: r.status, side: r.side, message });
  }
  const flags = [];
  // Hard comfort limits from the BODY (not style targets): a muscular chest,
  // arms or thighs that physically won't fit comfortably.
  const bd = profile.body || {};
  const hi = v => Array.isArray(v) ? Math.max(...v.map(Number)) : num(v);
  const limits = {
    chestFlat: hi(bd.chest) != null ? (hi(bd.chest) + 6) / 2 : null,
    bicepFlat: hi(bd.biceps) != null ? (hi(bd.biceps) + 2) / 2 : null,
    thighFlat: hi(bd.thigh) != null ? (hi(bd.thigh) + 2) / 2 : null,
    hipFlat: hi(bd.hips) != null ? (hi(bd.hips) + 2) / 2 : null,
    shoulder: CATEGORIES[category]?.group === 'top' && hi(bd.shoulder) != null ? hi(bd.shoulder) - 4 : null,
  };
  for (const d of dims) {
    const lim = limits[d.key];
    if (lim != null && d.value != null && d.value < lim) flags.push(`Too tight: ${d.label.toLowerCase()} (${d.value} cm vs ~${round1(lim)} cm minimum for your body)`);
  }
  // Room to grow toward the target weight.
  const target = num(profile.body?.targetWeightLb);
  const current = num(profile.body?.weightLb);
  if (target && current && target > current + 3) {
    for (const d of dims) {
      if (['chestFlat', 'thighFlat', 'bicepFlat', 'waistFlat'].includes(d.key) && d.value != null && d.value - d.ideal[0] < 1.5) {
        flags.push(`Little room to grow in the ${d.label.toLowerCase().split(' (')[0]} if you bulk toward ${target} lb`);
      }
    }
  }
  // Hemming hint for pants.
  const ins = dims.find(d => d.key === 'inseam' && d.value != null);
  if (ins && ins.value > ins.ideal[1]) {
    flags.push(`Needs ~${round1(ins.value - (ins.ideal[0] + ins.ideal[1]) / 2)} cm hemmed off for a clean break`);
  }
  const score = wSum > 0 ? Math.round(sSum / wSum) : null;
  const confidence = wTotal > 0 ? wSum / wTotal : 0;
  return { score, confidence, dims, flags, measured: m };
}

// Body-measurement size charts ("fits chest 96–101 cm") are scored by where
// the user's body falls inside each size's range.
export function scoreBodySize(category, body, profile) {
  const group = CATEGORIES[category]?.group;
  const b = profile.body || {};
  const mid = v => Array.isArray(v) ? (Number(v[0]) + Number(v[1])) / 2 : num(v);
  const mine = { chest: mid(b.chest), waist: mid(b.waist), hips: mid(b.hips), height: mid(b.heightCm), inseam: mid(b.inseamCm) };
  const weights = group === 'bottom'
    ? { waist: 3, hips: 2, inseam: 2, height: 0.5 }
    : { chest: 3, waist: 1, height: 1.5 };
  const dims = [];
  let wSum = 0, sSum = 0, wTotal = 0;
  for (const [k, w] of Object.entries(weights)) {
    wTotal += w;
    const range = body?.[k];
    if (!Array.isArray(range) || mine[k] == null || num(range[0]) == null) continue;
    const lo = num(range[0]), hi = num(range[1] ?? range[0]);
    const v = mine[k];
    const dist = v < lo ? lo - v : v > hi ? v - hi : 0;
    const s = Math.max(0, 100 - dist * 12);
    wSum += w; sSum += s * w;
    dims.push({
      key: k, label: `Your ${k} (${round1(v)} cm) vs size range`, value: round1(v), ideal: [lo, hi], ok: [lo, hi],
      score: Math.round(s), status: dist === 0 ? 'ideal' : s >= 65 ? 'ok' : 'off', side: v < lo ? 'low' : v > hi ? 'high' : null,
      message: dist === 0 ? `inside ${lo}–${hi} cm` : `${round1(dist)} cm ${v < lo ? 'below' : 'above'} this size's ${lo}–${hi} cm range`,
    });
  }
  const score = wSum > 0 ? Math.round(sSum / wSum) : null;
  // Body charts say nothing about cut, length or drape, so confidence is capped.
  return { score, confidence: Math.min(0.55, wTotal ? wSum / wTotal * 0.55 : 0), dims, flags: [], measured: {} };
}

const STYLE_WEIGHTS = { fabric_drape: 1.3, branding: 1, color: 0.8, aesthetic: 1.2, value: 1 };

export function styleScore(style) {
  if (!style) return null;
  let s = 0, w = 0;
  for (const [k, wt] of Object.entries(STYLE_WEIGHTS)) {
    const v = num(style[k]?.score);
    if (v == null) continue;
    s += Math.max(0, Math.min(100, v)) * wt;
    w += wt;
  }
  return w ? Math.round(s / w) : null;
}

// Evaluate a whole item (as returned by the AI extractor or entered by hand).
export function evaluateItem(item, profile) {
  const category = CATEGORIES[item.category] ? item.category : 'other';
  const sizes = Array.isArray(item.sizes) ? item.sizes : [];
  const results = sizes.map(sz => {
    const hasGarment = sz.measurements && Object.values(sz.measurements).some(v => num(v) != null);
    const hasBody = sz.body && Object.values(sz.body).some(v => Array.isArray(v));
    let r;
    if (hasGarment && profile.ideals?.[category]) {
      r = scoreGarmentSize(category, sz.measurements, profile, { waistType: item.waist_type });
      r.basis = sz.source === 'estimated' ? 'estimated garment measurements' : 'garment measurements';
      if (sz.source === 'estimated') r.confidence *= 0.6;
    } else if (hasBody) {
      r = scoreBodySize(category, sz.body, profile);
      r.basis = 'body-size chart';
    } else {
      r = { score: null, confidence: 0, dims: [], flags: [], basis: 'no measurements' };
    }
    return { size: String(sz.size ?? '?'), ...r };
  });

  const scored = results.filter(r => r.score != null);
  let best = null;
  if (scored.length) {
    best = scored.reduce((a, b) => (b.score > a.score || (b.score === a.score && b.confidence > a.confidence)) ? b : a);
  }

  const style = styleScore(item.style);
  const aiFit = num(item.ai_fit_estimate?.score);
  let fit = best?.score ?? null;
  let fitConfidence = best?.confidence ?? 0;
  // With little hard data, lean on the AI's own fit estimate.
  if (aiFit != null && fitConfidence < 0.5) {
    fit = fit == null ? aiFit : Math.round(fit * fitConfidence * 2 + aiFit * (1 - fitConfidence * 2));
    fitConfidence = Math.max(fitConfidence, 0.3);
  }

  let overall;
  if (fit != null && style != null) overall = Math.round(fit * 0.6 + style * 0.4);
  else overall = fit ?? style ?? null;
  // A hard tightness problem caps the verdict no matter how nice the fabric is.
  if (best?.flags?.some(f => f.startsWith('Too tight'))) overall = Math.min(overall, 60);
  for (const f of (item.red_flags || [])) {
    if (/dealbreaker/i.test(f)) overall = Math.min(overall ?? 100, 55);
  }

  return {
    category,
    sizes: results,
    bestSize: best?.size ?? item.ai_size_pick?.size ?? null,
    fitScore: fit,
    fitConfidence,
    styleScore: style,
    overall,
    verdict: verdictFor(overall),
  };
}

// Compare a size's measurements against a reference garment the user loved.
export function compareToReference(rawMeasurements, reference) {
  if (!reference?.measurements) return [];
  const a = deriveMeasurements(rawMeasurements);
  const b = deriveMeasurements(reference.measurements);
  const out = [];
  for (const k of Object.keys(DIMS)) {
    if (a[k] != null && b[k] != null) out.push({ key: k, label: DIMS[k].label, value: a[k], ref: b[k], diff: round1(a[k] - b[k]) });
  }
  return out;
}

export function referencesFor(category, profile) {
  const group = CATEGORIES[category]?.group;
  const refs = profile.references || [];
  const same = refs.filter(r => r.category === category && r.measurements && Object.keys(r.measurements).length);
  if (same.length) return same;
  return refs.filter(r => CATEGORIES[r.category]?.group === group && r.measurements && Object.keys(r.measurements).length && r.outcome === 'perfect');
}
