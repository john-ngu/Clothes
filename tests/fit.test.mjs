// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreValue, deriveMeasurements, scoreGarmentSize, evaluateItem, compareToReference } from '../js/fit.js';
import { DEFAULT_PROFILE } from '../js/profile.js';

const profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
const bts = profile.references.find(r => r.id === 'ref-bts-hoodie');

test('scoreValue: ideal, acceptable, and off ranges', () => {
  assert.equal(scoreValue(66, [65, 68], [63, 70]).score, 100);
  const ok = scoreValue(69, [65, 68], [63, 70]);
  assert.equal(ok.status, 'ok'); assert.ok(ok.score < 100 && ok.score > 65);
  const off = scoreValue(75, [65, 68], [63, 70]);
  assert.equal(off.status, 'off'); assert.equal(off.side, 'high'); assert.ok(off.score < 65);
});

test('sleeve reach derives from shoulder/2 + sleeve', () => {
  assert.equal(deriveMeasurements({ shoulder: 56.6, sleeve: 59.7 }).reach, 88);
  assert.equal(deriveMeasurements({ sleeveCB: 86 }).reach, 86);
});

test('the perfect-fit BTS hoodie (M) scores 100 against hoodie targets', () => {
  const r = scoreGarmentSize('hoodie', bts.measurements, profile);
  assert.equal(r.score, 100);
  assert.deepEqual(r.flags, []);
});

test('a long hoodie is marked down and explains why', () => {
  const r = scoreGarmentSize('hoodie', { ...bts.measurements, length: 74 }, profile);
  assert.ok(r.score < 95);
  const len = r.dims.find(d => d.key === 'length');
  assert.equal(len.status, 'off');
  assert.match(len.message, /long/);
});

test('a tight tee is flagged and capped at "Workable" or below', () => {
  const item = { category: 'tshirt', sizes: [{ size: 'S', measurements: { chestFlat: 48, length: 66, shoulder: 44 } }],
    style: { fabric_drape: { score: 95 }, branding: { score: 100 }, color: { score: 100 }, aesthetic: { score: 95 }, value: { score: 95 } } };
  const ev = evaluateItem(item, profile);
  assert.ok(ev.sizes[0].flags.some(f => f.startsWith('Too tight')));
  assert.ok(ev.overall <= 60);
});

test('evaluateItem picks the best size', () => {
  const item = { category: 'hoodie', sizes: [
    { size: 'S', measurements: { length: 64, chestFlat: 65, shoulder: 53, sleeve: 58 } },
    { size: 'M', measurements: { length: 67.5, chestFlat: 70, shoulder: 56, sleeve: 60 } },
    { size: 'L', measurements: { length: 71.5, chestFlat: 75, shoulder: 59, sleeve: 62 } },
  ] };
  const ev = evaluateItem(item, profile);
  assert.equal(ev.bestSize, 'M');
  assert.equal(ev.verdict.key, 'perfect');
});

test('long trousers suggest hemming', () => {
  const r = scoreGarmentSize('casual_pants', { waistFlat: 42, hipFlat: 53, thighFlat: 35, inseam: 81, legOpeningFlat: 24 }, profile);
  assert.ok(r.flags.some(f => /hemmed/.test(f)));
});

test('elastic waists are judged on a stretch scale', () => {
  const fixed = scoreGarmentSize('sweatpants', { waistFlat: 36 }, profile);
  const elastic = scoreGarmentSize('sweatpants', { waistFlat: 36 }, profile, { waistType: 'elastic' });
  assert.ok(elastic.score > fixed.score);
});

test('body-chart sizing works when no garment measurements exist', () => {
  const item = { category: 'tshirt', sizes: [
    { size: 'S', body: { chest: [86, 94], waist: [71, 79] } },
    { size: 'M', body: { chest: [94, 102], waist: [79, 87] } },
  ] };
  const ev = evaluateItem(item, profile);
  assert.equal(ev.bestSize, 'M');
  assert.ok(ev.fitConfidence <= 0.55);
});

test('reference comparison shows per-dimension differences', () => {
  const rows = compareToReference({ length: 69.4, chestFlat: 70, shoulder: 56.6, sleeve: 59.7 }, bts);
  assert.equal(rows.find(r => r.key === 'length').diff, 2);
  assert.equal(rows.find(r => r.key === 'chestFlat').diff, -1.2);
});

test('shoes with no measurements fall back to style + AI estimate', () => {
  const ev = evaluateItem({ category: 'shoes', sizes: [], ai_fit_estimate: { score: 80 }, style: { aesthetic: { score: 90 } } }, profile);
  assert.ok(ev.overall > 0);
});

test('a regular-fit (non-boxy) hoodie scores below the BTS-style target', () => {
  const regular = scoreGarmentSize('hoodie', { length: 67, chestFlat: 58, shoulder: 49, sleeve: 62 }, profile);
  const boxy = scoreGarmentSize('hoodie', { length: 67, chestFlat: 72, shoulder: 57, sleeve: 59 }, profile);
  assert.ok(boxy.score > regular.score + 15);
});

test('wide hems are marked down for pants (no excess fabric at the bottom)', () => {
  const r = scoreGarmentSize('casual_pants', { waistFlat: 42, thighFlat: 36, inseam: 72, legOpeningFlat: 30 }, profile);
  assert.equal(r.dims.find(d => d.key === 'legOpeningFlat').status, 'off');
});
