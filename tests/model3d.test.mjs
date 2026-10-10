import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyModel, garmentModel, bodyAnchors } from '../js/model3d.js';
import { DEFAULT_PROFILE } from '../js/profile.js';

const profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
const body = bodyModel(profile);
const bts = profile.references.find(r => r.id === 'ref-bts-hoodie');

test('your reference hoodie hem lands at your upper hip (calibration anchor)', () => {
  const g = garmentModel({ category: 'hoodie' }, bts.measurements, profile, body);
  assert.ok(Math.abs(g.hemY - body.y.upperHip) < 0.01);
});

test('a longer top hangs lower; a bigger chest is wider', () => {
  const a = garmentModel({ category: 'hoodie' }, { ...bts.measurements }, profile, body);
  const b = garmentModel({ category: 'hoodie' }, { ...bts.measurements, length: 74, chestFlat: 76 }, profile, body);
  assert.ok(b.hemY < a.hemY);
  assert.ok(b.rings[2].a > a.rings[2].a);
});

test('garment never sits inside the body', () => {
  const g = garmentModel({ category: 'longsleeve' }, { chestFlat: 40, length: 66, shoulder: 40 }, profile, body);
  for (const r of g.rings.slice(1)) assert.ok(r.a > 0 && r.b > 0);
  assert.ok(g.ease.slice(1).every(e => e > 0));
});

test('long pants report stacking at the ankle', () => {
  const g = garmentModel({ category: 'casual_pants' }, { waistFlat: 42, hipFlat: 53, thighFlat: 35, inseam: 82, legOpeningFlat: 24 }, profile, body);
  assert.ok(g.stack > 0);
  assert.match(g.anchors.inseam.note, /stack/);
  const ok = garmentModel({ category: 'casual_pants' }, { waistFlat: 42, inseam: 72 }, profile, body);
  assert.equal(ok.stack, 0);
  assert.ok(ok.assumed.includes('thighFlat'));
});

test('geometry has no NaN and body anchors carry your measurements', () => {
  const all = [
    garmentModel({ category: 'tshirt' }, { chestFlat: 58, length: 66, shoulder: 50, sleeve: 22 }, profile, body),
    garmentModel({ category: 'jacket' }, {}, profile, body),
    garmentModel({ category: 'sweatpants', waist_type: 'elastic' }, { inseam: 71 }, profile, body),
    garmentModel({ category: 'shoes', shoe: { stack_height_mm: 38 } }, {}, profile, body),
    bodyAnchors(body),
  ];
  assert.ok(!JSON.stringify(all).includes('null'));
  assert.equal(bodyAnchors(body).find(a => a.key === 'chest').value, 99);
});
