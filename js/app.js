import { CATEGORIES, DIMS, evaluateItem, compareToReference, referencesFor, verdictFor } from './fit.js';
import { loadProfile, saveProfile, resetProfile, loadSettings, saveSettings, loadChecks, saveChecks, exportAll, importAll, uid, DEFAULT_PROFILE } from './profile.js';

// ai.js pulls in the bundled SDK; load it lazily so the app opens instantly
// and the fit calculator works even if that file fails to load.
let aiModule = null;
async function ai() { return aiModule ??= await import('./ai.js'); }

let profile = loadProfile();
let settings = loadSettings();

// ---------- tiny DOM helper (text is always set via text nodes → no HTML injection) ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
// append/replaceChildren would print null as the text "null" — filter first.
const kids = list => list.flat(Infinity).filter(c => c != null && c !== false);
const fill = (el, ...c) => { el.replaceChildren(...kids(c)); return el; };
const add = (el, ...c) => { el.append(...kids(c)); return el; };
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const fmtMoney = (p, cur = 'USD') => p == null ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 2 }).format(p);
const fmtCost = c => c < 0.01 ? '<$0.01' : `$${c.toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const clone = o => JSON.parse(JSON.stringify(o));

function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

function persistProfile() { saveProfile(profile); }

// ---------- navigation ----------
const views = { check: renderCheck, saved: renderSaved, profile: renderProfile, settings: renderSettings };
let currentView = 'check';
const main = document.getElementById('main');

function go(view) {
  currentView = view;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  main.replaceChildren();
  views[view]();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

// ---------- CHECK ----------
let checkMode = 'item';
let pendingImages = [];
let lastResult = null; // { item, usage, model, alternatives }

function categorySelect(value, { allowAuto = true, onchange } = {}) {
  return h('select', { onchange },
    allowAuto ? h('option', { value: '' }, 'Auto-detect category') : null,
    Object.entries(CATEGORIES).map(([k, c]) => h('option', { value: k, selected: k === value ? true : null }, c.label)));
}

function renderCheck() {
  const modes = [['item', 'Check an item'], ['find', 'Find me something'], ['manual', 'Enter manually']];
  add(main, 
    h('div', { class: 'segmented' }, modes.map(([k, label]) =>
      h('button', { class: checkMode === k ? 'active' : '', onclick: () => { checkMode = k; go('check'); } }, label))),
  );
  if (!settings.apiKey && checkMode !== 'manual') {
    add(main, h('div', { class: 'notice' }, 'AI features need your Anthropic API key. ',
      h('a', { href: '#', onclick: e => { e.preventDefault(); go('settings'); } }, 'Add it in Settings'),
      '. You can still use “Enter manually” without one.'));
  }
  if (checkMode === 'item') renderCheckItemForm();
  else if (checkMode === 'find') renderFindForm();
  else renderManualForm();

  const out = h('div', { id: 'result' });
  add(main, out);
  if (lastResult && lastResult.mode === checkMode) renderResultBlock(out, lastResult);
}

function renderCheckItemForm() {
  const ta = h('textarea', { rows: 4, placeholder: 'Paste a product link, or describe it — e.g. “Uniqlo Sweat Full-Zip Hoodie, navy, size M”' });
  const cat = categorySelect('');
  const thumbs = h('div', { class: 'thumbs' });
  const drawThumbs = () => fill(thumbs, ...pendingImages.map((img, i) =>
    h('div', { class: 'thumb' }, h('img', { src: img.preview, alt: 'attached screenshot' }),
      h('button', { class: 'x', 'aria-label': 'remove', onclick: () => { pendingImages.splice(i, 1); drawThumbs(); } }, '×'))));
  drawThumbs();
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden', onchange: async e => {
    const { fileToImage } = await ai();
    for (const f of e.target.files) {
      if (pendingImages.length >= 6) { toast('Up to 6 images'); break; }
      try { pendingImages.push(await fileToImage(f)); } catch { toast('Could not read that image'); }
    }
    e.target.value = '';
    drawThumbs();
  } });
  const btn = h('button', { class: 'primary', onclick: async () => {
    const text = ta.value.trim();
    if (!text && !pendingImages.length) return toast('Paste a link, describe the item, or add a screenshot');
    await runCheck({ text, images: pendingImages.slice(), category: cat.value || null });
  } }, 'Check fit');
  add(main, h('section', { class: 'card' },
    h('label', {}, 'Item'), ta,
    h('div', { class: 'row' }, h('button', { class: 'ghost', onclick: () => file.click() }, '📷 Add screenshots / photos'), file),
    thumbs,
    h('label', {}, 'Category'), cat,
    btn,
    h('p', { class: 'hint' }, 'Tip: screenshots of the size chart give the most accurate verdict. Each check searches the web and typically costs a few to ~30 cents on Opus (shown after each run).')));
}

function renderFindForm() {
  const ta = h('textarea', { rows: 3, placeholder: 'e.g. “Dark navy zip hoodie, lightweight and drapey, under $40” or “Black athletic sweatpants with an open hem”' });
  add(main, h('section', { class: 'card' },
    h('label', {}, 'What are you looking for?'), ta,
    h('button', { class: 'primary', onclick: async () => {
      const request = ta.value.trim();
      if (!request) return toast('Describe what you want');
      await runFind({ request });
    } }, 'Find the best options'),
    h('p', { class: 'hint' }, 'Searches current retailers, pulls each option’s size chart, and ranks them with your fit math.')));
}

let manualDraft = null;
function renderManualForm() {
  manualDraft ??= { brand: '', name: '', category: 'hoodie', price: null, sizes: [{ size: 'M', measurements: {} }] };
  const d = manualDraft;
  const dimsFor = cat => {
    const spec = profile.ideals[cat] || {};
    return MEAS_KEYS.filter(k => k in spec || (k.startsWith('sleeve') && 'reach' in spec));
  };
  const labelFor = k => ({ sleeve: 'Sleeve (shoulder seam→cuff)', sleeveCB: 'Sleeve (center back→cuff)' }[k] || DIMS[k]?.label || k);
  const body = h('div');
  const draw = () => {
    const keys = dimsFor(d.category);
    fill(body, 
      h('label', {}, 'Brand & name'),
      h('div', { class: 'row' },
        h('input', { placeholder: 'Brand', value: d.brand, oninput: e => d.brand = e.target.value }),
        h('input', { placeholder: 'Item name', value: d.name, oninput: e => d.name = e.target.value })),
      h('label', {}, 'Category'),
      categorySelect(d.category, { allowAuto: false, onchange: e => { d.category = e.target.value; draw(); } }),
      keys.length ? h('div', {},
        h('p', { class: 'hint' }, 'Garment measurements in cm. “Flat” = laid flat (half the circumference). Leave unknowns blank.'),
        ...d.sizes.map((s, i) => h('div', { class: 'size-block' },
          h('div', { class: 'row' },
            h('input', { class: 'size-name', value: s.size, placeholder: 'Size', oninput: e => s.size = e.target.value }),
            d.sizes.length > 1 ? h('button', { class: 'ghost small', onclick: () => { d.sizes.splice(i, 1); draw(); } }, 'Remove') : null),
          h('div', { class: 'grid2' }, keys.map(k => h('label', { class: 'mini' }, labelFor(k),
            h('input', { type: 'number', inputmode: 'decimal', step: '0.1', value: s.measurements[k] ?? '', oninput: e => { s.measurements[k] = e.target.value === '' ? undefined : Number(e.target.value); } })))))),
        h('button', { class: 'ghost', onclick: () => { d.sizes.push({ size: '', measurements: {} }); draw(); } }, '+ Add another size'))
        : h('p', { class: 'hint' }, 'This category has no measurement targets — use the AI check instead.'),
      h('button', { class: 'primary', onclick: () => {
        const item = { ...clone(d), sizes: d.sizes.filter(s => s.size) };
        lastResult = { mode: 'manual', item, usage: null };
        const out = document.getElementById('result');
        out.replaceChildren();
        renderResultBlock(out, lastResult);
        out.scrollIntoView({ behavior: 'smooth' });
      } }, 'Score it'),
    );
  };
  draw();
  add(main, h('section', { class: 'card' }, body));
}

function busy(container, msg) {
  const status = h('span', {}, msg);
  fill(container, h('div', { class: 'card loading' }, h('div', { class: 'spinner' }), status,
    h('p', { class: 'hint' }, 'Web research usually takes 30–90 seconds. Keep this screen open.')));
  return m => { status.textContent = m; };
}

async function runCheck(input) {
  const out = document.getElementById('result');
  const setStatus = busy(out, 'Starting…');
  out.scrollIntoView({ behavior: 'smooth' });
  try {
    const { analyzeItem } = await ai();
    const r = await analyzeItem(settings, profile, input, setStatus);
    lastResult = { mode: 'item', item: r.item, usage: r.usage, model: r.model, input: { text: input.text } };
    pendingImages = [];
    out.replaceChildren();
    renderResultBlock(out, lastResult);
  } catch (e) {
    fill(out, errorCard(e));
  }
}

async function runFind({ request }) {
  const out = document.getElementById('result');
  const setStatus = busy(out, 'Searching retailers…');
  out.scrollIntoView({ behavior: 'smooth' });
  try {
    const { findAlternatives } = await ai();
    const r = await findAlternatives(settings, profile, { request }, setStatus);
    lastResult = { mode: 'find', request, alternatives: r.alternatives, notes: r.notes, usage: r.usage, model: r.model };
    out.replaceChildren();
    renderResultBlock(out, lastResult);
  } catch (e) {
    fill(out, errorCard(e));
  }
}

function errorCard(e) {
  console.error(e);
  return h('div', { class: 'card error' }, h('strong', {}, 'Something went wrong'), h('p', {}, e?.message || String(e)));
}

function renderResultBlock(out, res) {
  if (res.mode === 'find') {
    add(out, h('h2', { class: 'section-title' }, `Best options for: ${res.request}`));
    renderAlternatives(out, res.alternatives, res.notes);
    if (res.usage) add(out, usageLine(res.usage, res.model));
    return;
  }
  add(out, renderItemResult(res.item, { usage: res.usage, model: res.model, allowAlternatives: true, allowSave: true }));
  if (res.alternatives) {
    add(out, h('h2', { class: 'section-title' }, 'Better alternatives'));
    renderAlternatives(out, res.alternatives.list, res.alternatives.notes);
    if (res.alternatives.usage) add(out, usageLine(res.alternatives.usage, res.alternatives.model));
  }
}

function usageLine(u, model) {
  return h('p', { class: 'hint center' }, `${model || ''} · ${u.searches} searches · ${u.fetches} page fetches · est. cost ${fmtCost(u.cost)}`);
}

function renderAlternatives(out, alts, notes) {
  if (!alts?.length) { add(out, h('div', { class: 'card' }, 'No alternatives found.', notes ? h('p', { class: 'hint' }, notes) : null)); return; }
  const ranked = alts.map(item => ({ item, ev: evaluateItem(item, profile) }))
    .sort((a, b) => (b.ev.overall ?? -1) - (a.ev.overall ?? -1));
  ranked.forEach(({ item, ev }, i) => {
    const details = h('div', { class: 'hidden' });
    let built = false;
    const card = h('div', { class: 'card alt' },
      h('div', { class: 'alt-head', onclick: () => {
        if (!built) { details.append(renderItemResult(item, { compact: true, allowSave: true })); built = true; }
        details.classList.toggle('hidden');
      } },
        scoreBadge(ev.overall, ev.verdict),
        h('div', { class: 'alt-text' },
          h('div', { class: 'alt-title' }, `${i + 1}. ${item.brand || ''} ${item.name || ''}`.trim()),
          h('div', { class: 'alt-sub' }, [fmtMoney(item.price, item.currency), ev.bestSize ? `size ${ev.bestSize}` : '', ev.verdict.label].filter(Boolean).join(' · ')),
          item.why ? h('div', { class: 'alt-why' }, item.why) : null),
        h('span', { class: 'chev' }, '›')),
      details);
    add(out, card);
  });
  if (notes) add(out, h('p', { class: 'hint' }, notes));
}

function scoreBadge(score, verdict) {
  return h('div', { class: `badge v-${verdict?.key || 'unknown'}` }, score == null ? '–' : String(score));
}

function rangeBar(d) {
  // Visual: acceptable range (light), ideal range (strong), marker for value.
  const lo = Math.min(d.ok[0], d.value ?? d.ok[0]) - 2;
  const hi = Math.max(d.ok[1], d.value ?? d.ok[1]) + 2;
  const pct = v => `${((v - lo) / (hi - lo)) * 100}%`;
  return h('div', { class: 'rangebar' },
    h('div', { class: 'rb-ok', style: { left: pct(d.ok[0]), width: `calc(${pct(d.ok[1])} - ${pct(d.ok[0])})` } }),
    h('div', { class: 'rb-ideal', style: { left: pct(d.ideal[0]), width: `calc(${pct(d.ideal[1])} - ${pct(d.ideal[0])})` } }),
    d.value != null ? h('div', { class: `rb-mark s-${d.status}`, style: { left: pct(d.value) } }) : null);
}

function renderItemResult(item, opts = {}) {
  const wrap = h('div', { class: 'result' });
  const draw = () => {
    const ev = evaluateItem(item, profile);
    const best = ev.sizes.find(s => s.size === ev.bestSize);
    const link = safeUrl(item.url);
    fill(wrap, 
      h('div', { class: `card verdict v-${ev.verdict.key}` },
        h('div', { class: 'verdict-top' },
          scoreBadge(ev.overall, ev.verdict),
          h('div', {},
            h('div', { class: 'verdict-label' }, ev.verdict.label),
            h('div', { class: 'verdict-item' }, `${item.brand || ''} ${item.name || ''}`.trim() || 'This item'),
            h('div', { class: 'verdict-meta' }, [fmtMoney(item.price, item.currency), item.color_considered, CATEGORIES[ev.category]?.label].filter(Boolean).join(' · ')))),
        ev.bestSize && ev.category !== 'shoes' ? h('div', { class: 'size-pick' }, 'Your size: ', h('strong', {}, ev.bestSize)) : null,
        ev.category === 'shoes' && item.shoe?.recommended_size ? h('div', { class: 'size-pick' }, 'Your size: ', h('strong', {}, item.shoe.recommended_size)) : null,
        h('div', { class: 'subscores' },
          sub('Fit', ev.fitScore), sub('Style', ev.styleScore),
          h('div', { class: 'sub' }, h('span', {}, 'Confidence'), h('strong', {}, confidenceLabel(ev.fitConfidence, best?.basis)))),
        item.summary ? h('p', { class: 'summary' }, item.summary) : null,
        link ? h('a', { class: 'ext', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Open product page ↗') : null),

      flagsCard(best, item),
      prosCons(item),
      best && best.dims.length ? sizeDetailCard(best, item) : null,
      ev.sizes.length > 1 ? sizesTable(ev) : null,
      referenceCard(item, ev),
      item.shoe ? shoeCard(item.shoe) : null,
      styleCard(item.style),
      editCard(item, draw),
      actionsRow(item, ev, opts),
      item.sources?.length ? h('details', { class: 'card' }, h('summary', {}, 'Sources'),
        h('ul', {}, item.sources.map(s => { const u = safeUrl(s); return h('li', {}, u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, s) : s); }))) : null,
      opts.usage ? usageLine(opts.usage, opts.model) : null,
    );
  };
  draw();
  return wrap;
}

function confidenceLabel(c, basis) {
  const level = c >= 0.75 ? 'High' : c >= 0.45 ? 'Medium' : 'Low';
  return basis ? `${level}` : level;
}
function sub(label, v) { return h('div', { class: 'sub' }, h('span', {}, label), h('strong', {}, v == null ? '–' : String(v))); }

function flagsCard(best, item) {
  const flags = [...(item.red_flags || []).filter(Boolean), ...(best?.flags || [])];
  if (!flags.length) return null;
  return h('div', { class: 'card flags' }, h('h3', {}, 'Heads up'), h('ul', {}, flags.map(f => h('li', {}, f))));
}
function prosCons(item) {
  if (!item.pros?.length && !item.cons?.length) return null;
  return h('div', { class: 'card procon' },
    item.pros?.length ? h('div', {}, h('h3', {}, 'Works for you'), h('ul', { class: 'pros' }, item.pros.map(p => h('li', {}, p)))) : null,
    item.cons?.length ? h('div', {}, h('h3', {}, 'Watch out'), h('ul', { class: 'cons' }, item.cons.map(p => h('li', {}, p)))) : null);
}

function sizeDetailCard(best, item) {
  return h('div', { class: 'card' },
    h('h3', {}, `Size ${best.size} vs your targets`),
    h('p', { class: 'hint' }, `Based on ${best.basis}. Bars: light = acceptable, dark = your sweet spot, dot = this size.`),
    best.dims.map(d => h('div', { class: 'dim' },
      h('div', { class: 'dim-head' }, h('span', {}, d.label), h('span', { class: `pill s-${d.status}` }, d.status === 'missing' ? 'n/a' : d.status === 'ideal' ? '✓' : d.status === 'ok' ? 'close' : 'off')),
      d.status !== 'missing' ? rangeBar(d) : null,
      h('div', { class: 'dim-msg' }, d.message))));
}

function sizesTable(ev) {
  return h('div', { class: 'card' }, h('h3', {}, 'All sizes'),
    h('table', { class: 'sizes' },
      h('tr', {}, h('th', {}, 'Size'), h('th', {}, 'Fit score'), h('th', {}, 'Notes')),
      ev.sizes.map(s => h('tr', { class: s.size === ev.bestSize ? 'best' : '' },
        h('td', {}, s.size), h('td', {}, s.score == null ? '–' : String(s.score)),
        h('td', {}, s.flags?.[0] || (s.dims.filter(d => d.status === 'off').map(d => d.label.split(' (')[0]).join(', ') || (s.score != null ? 'no major issues' : s.basis)))))));
}

function referenceCard(item, ev) {
  if (ev.category === 'other' || ev.category === 'shoes') return null;
  const refs = referencesFor(ev.category, profile);
  const bestSize = item.sizes?.find(s => String(s.size) === String(ev.bestSize));
  if (!refs.length || !bestSize?.measurements) return null;
  const blocks = refs.map(ref => {
    const rows = compareToReference(bestSize.measurements, ref);
    if (!rows.length) return null;
    return h('div', {},
      h('p', { class: 'hint' }, `Size ${ev.bestSize} vs your ${ref.name} (${ref.size}, ${ref.outcome.replace('_', ' ')})`),
      h('table', { class: 'sizes' }, h('tr', {}, h('th', {}, ''), h('th', {}, 'This'), h('th', {}, 'Yours'), h('th', {}, 'Diff')),
        rows.map(r => h('tr', {}, h('td', {}, r.label.split(' (')[0]), h('td', {}, r.value), h('td', {}, r.ref),
          h('td', { class: Math.abs(r.diff) <= 1.5 ? 'good' : Math.abs(r.diff) <= 3.5 ? 'warn' : 'bad' }, `${r.diff > 0 ? '+' : ''}${r.diff} cm`)))));
  }).filter(Boolean);
  if (!blocks.length) return null;
  return h('div', { class: 'card' }, h('h3', {}, 'Compared with clothes you own'), blocks);
}

function shoeCard(s) {
  return h('div', { class: 'card' }, h('h3', {}, 'Shoe fit'),
    s.recommended_size ? h('p', {}, h('strong', {}, `Size ${s.recommended_size}`), s.reason ? ` — ${s.reason}` : '') : null,
    s.stack_height_mm ? h('p', {}, `Stack height: ~${s.stack_height_mm} mm`) : null,
    s.height_boost ? h('p', {}, `Height: ${s.height_boost}`) : null,
    s.comfort ? h('p', {}, `Comfort: ${s.comfort}`) : null);
}

function styleCard(style) {
  if (!style) return null;
  const labels = { fabric_drape: 'Fabric & drape', branding: 'Branding', color: 'Color', aesthetic: 'Aesthetic', value: 'Value' };
  return h('div', { class: 'card' }, h('h3', {}, 'Style match'),
    Object.entries(labels).map(([k, l]) => style[k] ? h('div', { class: 'style-row' },
      h('div', { class: 'style-head' }, h('span', {}, l), h('strong', {}, String(style[k].score ?? '–'))),
      h('div', { class: 'meter' }, h('div', { style: { width: `${Math.max(0, Math.min(100, style[k].score || 0))}%` } })),
      style[k].reason ? h('div', { class: 'dim-msg' }, style[k].reason) : null) : null));
}

function editCard(item, redraw) {
  const cat = CATEGORIES[item.category] ? item.category : 'other';
  if (!profile.ideals[cat] || !item.sizes?.length) return null;
  const keys = ['chestFlat', 'length', 'shoulder', 'sleeve', 'sleeveCB', 'bicepFlat', 'waistFlat', 'hipFlat', 'thighFlat', 'inseam', 'legOpeningFlat']
    .filter(k => item.sizes.some(s => s.measurements?.[k] != null) || (k in profile.ideals[cat]) || (k.startsWith('sleeve') && profile.ideals[cat].reach));
  const short = { chestFlat: 'Chest', length: 'Length', shoulder: 'Shldr', sleeve: 'Sleeve', sleeveCB: 'CB sleeve', bicepFlat: 'Bicep', waistFlat: 'Waist', hipFlat: 'Hip', thighFlat: 'Thigh', inseam: 'Inseam', legOpeningFlat: 'Hem' };
  return h('details', { class: 'card' },
    h('summary', {}, 'Check / correct the size chart (cm)'),
    h('p', { class: 'hint' }, 'If the AI misread anything, fix it here — scores update instantly. Flat = half circumference.'),
    h('div', { class: 'table-scroll' }, h('table', { class: 'edit' },
      h('tr', {}, h('th', {}, 'Size'), keys.map(k => h('th', {}, short[k]))),
      item.sizes.map(s => h('tr', {}, h('td', {}, String(s.size), s.source === 'estimated' ? h('small', {}, ' est.') : null),
        keys.map(k => h('td', {}, h('input', { type: 'number', inputmode: 'decimal', step: '0.1', value: s.measurements?.[k] ?? '',
          onchange: e => { s.measurements ??= {}; s.measurements[k] = e.target.value === '' ? undefined : Number(e.target.value); s.source = 'official'; redraw(); } }))))))));
}

function actionsRow(item, ev, opts) {
  return h('div', { class: 'actions' },
    opts.allowAlternatives ? h('button', { class: 'primary', onclick: async e => {
      const btn = e.currentTarget;
      btn.disabled = true; const orig = btn.textContent;
      try {
        const { findAlternatives } = await ai();
        const r = await findAlternatives(settings, profile, { baseItem: item }, m => { btn.textContent = m; });
        lastResult.alternatives = { list: r.alternatives, notes: r.notes, usage: r.usage, model: r.model };
        const out = document.getElementById('result');
        out.replaceChildren(); renderResultBlock(out, lastResult);
      } catch (err) { toast(err.message || String(err)); btn.textContent = orig; btn.disabled = false; }
    } }, 'Find better alternatives') : null,
    opts.allowSave ? h('button', { class: 'ghost', onclick: () => {
      const checks = loadChecks();
      checks.unshift({ id: uid('chk'), date: today(), item: clone(item), overall: ev.overall, verdict: ev.verdict.key, bestSize: ev.bestSize });
      saveChecks(checks); toast('Saved');
    } }, 'Save') : null,
    h('button', { class: 'ghost', onclick: () => openFitLogForm({ brand: item.brand, name: item.name, category: ev.category, size: ev.bestSize || '', measurements: item.sizes?.find(s => String(s.size) === String(ev.bestSize))?.measurements }) }, 'I tried it — log fit'));
}

// ---------- SAVED ----------
function renderSaved() {
  const checks = loadChecks();
  add(main, h('h2', { class: 'section-title' }, 'Saved checks'));
  if (!checks.length) { add(main, h('div', { class: 'card' }, 'Nothing saved yet. Tap “Save” on any result.')); return; }
  for (const c of checks) {
    const ev = evaluateItem(c.item, profile); // re-score with your current profile
    const details = h('div', { class: 'hidden' });
    let built = false;
    add(main, h('div', { class: 'card alt' },
      h('div', { class: 'alt-head', onclick: () => {
        if (!built) { details.append(renderItemResult(c.item, {})); built = true; }
        details.classList.toggle('hidden');
      } },
        scoreBadge(ev.overall, ev.verdict),
        h('div', { class: 'alt-text' },
          h('div', { class: 'alt-title' }, `${c.item.brand || ''} ${c.item.name || ''}`.trim() || 'Item'),
          h('div', { class: 'alt-sub' }, [c.date, ev.bestSize ? `size ${ev.bestSize}` : '', ev.verdict.label].filter(Boolean).join(' · '))),
        h('button', { class: 'ghost small', onclick: e => { e.stopPropagation(); saveChecks(loadChecks().filter(x => x.id !== c.id)); go('saved'); } }, 'Delete')),
      details));
  }
}

// ---------- PROFILE ----------
function numInput(obj, key, { step = '0.1' } = {}) {
  return h('input', { type: 'number', inputmode: 'decimal', step, value: obj[key] ?? '', onchange: e => { obj[key] = e.target.value === '' ? null : Number(e.target.value); persistProfile(); } });
}
function rangeInputs(obj, key) {
  const v = Array.isArray(obj[key]) ? obj[key] : [obj[key], obj[key]];
  const set = (i, val) => { const arr = [...v]; arr[i] = val === '' ? null : Number(val); obj[key] = arr; v[i] = arr[i]; persistProfile(); };
  return h('div', { class: 'row tight' },
    h('input', { type: 'number', inputmode: 'decimal', step: '0.1', value: v[0] ?? '', onchange: e => set(0, e.target.value) }),
    h('span', {}, '–'),
    h('input', { type: 'number', inputmode: 'decimal', step: '0.1', value: v[1] ?? '', onchange: e => set(1, e.target.value) }));
}

function renderProfile() {
  const b = profile.body;
  const field = (label, input) => h('label', { class: 'mini' }, label, input);
  add(main, 
    h('h2', { class: 'section-title' }, 'Your profile'),
    h('p', { class: 'hint' }, `Last updated ${profile.updated}. Everything saves automatically on this device.`),

    h('details', { class: 'card', open: true }, h('summary', {}, 'Body measurements (cm)'),
      h('div', { class: 'grid2' },
        field('Height', rangeInputs(b, 'heightCm')),
        field('Weight (lb)', numInput(b, 'weightLb', { step: '1' })),
        field('Target weight (lb)', numInput(b, 'targetWeightLb', { step: '1' })),
        field('Chest', numInput(b, 'chest')),
        field('Natural waist', numInput(b, 'waist')),
        field('Hips', numInput(b, 'hips')),
        field('Shoulder width', numInput(b, 'shoulder')),
        field('Torso length', numInput(b, 'torsoLength')),
        field('Arm length', numInput(b, 'armLength')),
        field('Biceps', rangeInputs(b, 'biceps')),
        field('Neck', numInput(b, 'neck')),
        field('Thigh', rangeInputs(b, 'thigh')),
        field('Calf', rangeInputs(b, 'calf')),
        field('Inseam', numInput(b, 'inseamCm')),
        field('Wrist', numInput(b, 'wrist')),
        field('Preferred top length', rangeInputs(b, 'shirtLength'))),
      h('label', {}, 'Weight note'),
      h('input', { value: b.weightNote || '', onchange: e => { b.weightNote = e.target.value; persistProfile(); } })),

    referencesSection(),
    fitLogSection(),
    shoesSection(),
    budgetsSection(),
    idealsSection(),

    h('details', { class: 'card' }, h('summary', {}, 'Style profile (what the AI reads)'),
      h('textarea', { rows: 16, value: profile.style, onchange: e => { profile.style = e.target.value; persistProfile(); toast('Saved'); } })),

    h('div', { class: 'card' }, h('h3', {}, 'Backup'),
      h('p', { class: 'hint' }, 'Your data lives only in this browser. Export a backup before clearing Safari data or switching phones.'),
      h('div', { class: 'actions' },
        h('button', { class: 'ghost', onclick: () => {
          const blob = new Blob([exportAll()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `fit-check-backup-${today()}.json` });
          document.body.append(a); a.click(); a.remove();
        } }, 'Export'),
        h('button', { class: 'ghost', onclick: () => {
          const inp = h('input', { type: 'file', accept: 'application/json,.json', onchange: async e => {
            try { importAll(await e.target.files[0].text()); profile = loadProfile(); toast('Imported'); go('profile'); } catch (err) { toast(err.message); }
          } });
          inp.click();
        } }, 'Import'),
        h('button', { class: 'ghost danger', onclick: () => {
          if (confirm('Reset your profile to the original defaults? Your fit log and edits will be lost (saved checks stay).')) { resetProfile(); profile = loadProfile(); go('profile'); }
        } }, 'Reset to defaults'))),
  );
}

const OUTCOMES = { perfect: 'Perfect', good: 'Good', too_big: 'Too big', too_small: 'Too small', too_long: 'Too long', too_short: 'Too short', loose: 'A bit loose', tight: 'A bit tight', returned: 'Returned', unknown: 'Not sure' };
const MEAS_KEYS = ['chestFlat', 'length', 'shoulder', 'sleeve', 'sleeveCB', 'bicepFlat', 'waistFlat', 'hipFlat', 'thighFlat', 'inseam', 'legOpeningFlat'];
const MEAS_LABEL = k => ({ sleeve: 'Sleeve (seam→cuff)', sleeveCB: 'Sleeve (center back→cuff)' }[k] || DIMS[k]?.label || k);

function referenceEditor(ref, onDone) {
  const r = clone(ref);
  r.measurements ??= {};
  return h('div', { class: 'editor' },
    h('label', {}, 'Name'), h('input', { value: r.name, oninput: e => r.name = e.target.value }),
    h('div', { class: 'row' },
      h('label', { class: 'mini' }, 'Category', categorySelect(r.category, { allowAuto: false, onchange: e => r.category = e.target.value })),
      h('label', { class: 'mini' }, 'Size', h('input', { value: r.size, oninput: e => r.size = e.target.value }))),
    h('label', {}, 'How it fit'),
    h('select', { onchange: e => r.outcome = e.target.value }, Object.entries(OUTCOMES).map(([k, l]) => h('option', { value: k, selected: k === r.outcome ? true : null }, l))),
    h('p', { class: 'hint' }, 'Garment measurements in cm (lay it flat and measure). These make the app much more accurate.'),
    h('div', { class: 'grid2' }, MEAS_KEYS.map(k => h('label', { class: 'mini' }, MEAS_LABEL(k),
      h('input', { type: 'number', inputmode: 'decimal', step: '0.1', value: r.measurements[k] ?? '', oninput: e => { if (e.target.value === '') delete r.measurements[k]; else r.measurements[k] = Number(e.target.value); } })))),
    h('label', {}, 'Notes'), h('textarea', { rows: 2, value: r.notes || '', oninput: e => r.notes = e.target.value }),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => onDone(r) }, 'Save'),
      h('button', { class: 'ghost', onclick: () => onDone(null) }, 'Cancel')));
}

function referencesSection() {
  const box = h('div');
  const draw = (editingId = null) => {
    fill(box, 
      h('p', { class: 'hint' }, 'Clothes you own. Ones marked “Perfect” with measurements become anchors: every new item is compared against them.'),
      ...profile.references.map(ref => editingId === ref.id
        ? referenceEditor(ref, r => { if (r) { Object.assign(ref, r); persistProfile(); } draw(); })
        : h('div', { class: 'list-item' },
          h('div', {}, h('div', { class: 'li-title' }, `${ref.name} — ${ref.size}`),
            h('div', { class: 'li-sub' }, `${OUTCOMES[ref.outcome] || ref.outcome} · ${CATEGORIES[ref.category]?.label || ref.category}${Object.keys(ref.measurements || {}).length ? ' · measured' : ' · no measurements yet'}`)),
          h('div', { class: 'row tight' },
            h('button', { class: 'ghost small', onclick: () => draw(ref.id) }, 'Edit'),
            h('button', { class: 'ghost small', onclick: () => { if (confirm(`Delete ${ref.name}?`)) { profile.references = profile.references.filter(x => x.id !== ref.id); persistProfile(); draw(); } } }, '×')))),
      editingId === 'new'
        ? referenceEditor({ id: uid('ref'), name: '', category: 'hoodie', size: 'M', outcome: 'perfect', measurements: {}, notes: '' }, r => { if (r) { profile.references.push(r); persistProfile(); } draw(); })
        : h('button', { class: 'ghost', onclick: () => draw('new') }, '+ Add a garment you own'));
  };
  draw();
  return h('details', { class: 'card' }, h('summary', {}, `Reference garments (${profile.references.length})`), box);
}

let fitLogPrefill = null;
function openFitLogForm(prefill) {
  fitLogPrefill = prefill;
  go('profile');
  setTimeout(() => document.getElementById('fitlog')?.scrollIntoView({ behavior: 'smooth' }), 50);
}

function fitLogSection() {
  const box = h('div');
  const draw = () => {
    const pre = fitLogPrefill;
    const form = pre ? (() => {
      const e = { id: uid('log'), date: today(), brand: pre.brand || '', name: pre.name || '', category: pre.category || 'other', size: pre.size || '', outcome: 'perfect', notes: '', measurements: pre.measurements || {} };
      return h('div', { class: 'editor' },
        h('div', { class: 'row' }, h('input', { placeholder: 'Brand', value: e.brand, oninput: x => e.brand = x.target.value }), h('input', { placeholder: 'Item', value: e.name, oninput: x => e.name = x.target.value })),
        h('div', { class: 'row' }, categorySelect(e.category, { allowAuto: false, onchange: x => e.category = x.target.value }), h('input', { placeholder: 'Size', value: e.size, oninput: x => e.size = x.target.value })),
        h('select', { onchange: x => e.outcome = x.target.value }, Object.entries(OUTCOMES).map(([k, l]) => h('option', { value: k }, l))),
        h('textarea', { rows: 2, placeholder: 'Notes — e.g. “length perfect, sleeves a bit long, fabric thinner than expected”', oninput: x => e.notes = x.target.value }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'mkref' }), ' Also add as a reference garment (uses its size-chart measurements)'),
        h('div', { class: 'actions' },
          h('button', { class: 'primary', onclick: () => {
            profile.fitLog.push(e);
            if (document.getElementById('mkref')?.checked) {
              profile.references.push({ id: uid('ref'), name: `${e.brand} ${e.name}`.trim(), category: e.category, size: e.size, outcome: e.outcome, measurements: clone(e.measurements || {}), notes: e.notes });
            }
            persistProfile(); fitLogPrefill = null; toast('Logged'); go('profile');
          } }, 'Save to fit log'),
          h('button', { class: 'ghost', onclick: () => { fitLogPrefill = null; draw(); } }, 'Cancel')));
    })() : h('button', { class: 'ghost', onclick: () => { fitLogPrefill = {}; draw(); } }, '+ Log something you tried on');
    fill(box, 
      h('p', { class: 'hint' }, 'Every item you try teaches the AI more about how brands fit you.'),
      form,
      ...profile.fitLog.slice().reverse().map(l => h('div', { class: 'list-item' },
        h('div', {}, h('div', { class: 'li-title' }, `${l.brand} ${l.name} — ${l.size}`),
          h('div', { class: 'li-sub' }, `${l.date} · ${OUTCOMES[l.outcome] || l.outcome}${l.notes ? ` · ${l.notes}` : ''}`)),
        h('button', { class: 'ghost small', onclick: () => { profile.fitLog = profile.fitLog.filter(x => x.id !== l.id); persistProfile(); draw(); } }, '×'))));
  };
  draw();
  return h('details', { class: 'card', id: 'fitlog', open: fitLogPrefill ? true : null }, h('summary', {}, `Fit log (${profile.fitLog.length})`), box);
}

function shoesSection() {
  const box = h('div');
  const draw = () => fill(box, 
    ...profile.shoes.map((s, i) => h('div', { class: 'row' },
      h('input', { value: s.model, placeholder: 'Shoe', onchange: e => { s.model = e.target.value; persistProfile(); } }),
      h('input', { class: 'narrow', value: s.size, placeholder: 'Size', onchange: e => { s.size = e.target.value; persistProfile(); } }),
      h('button', { class: 'ghost small', onclick: () => { profile.shoes.splice(i, 1); persistProfile(); draw(); } }, '×'))),
    h('button', { class: 'ghost', onclick: () => { profile.shoes.push({ model: '', size: '', notes: '' }); draw(); } }, '+ Add shoe'),
    h('label', {}, 'Shoe notes (foot length/width, fit feel)'),
    h('textarea', { rows: 3, value: profile.shoeNotes, onchange: e => { profile.shoeNotes = e.target.value; persistProfile(); } }));
  draw();
  return h('details', { class: 'card' }, h('summary', {}, 'Shoe sizes'), box);
}

function budgetsSection() {
  return h('details', { class: 'card' }, h('summary', {}, 'Budgets (USD, max per item)'),
    h('div', { class: 'grid2' }, Object.keys(profile.budgets).map(k =>
      h('label', { class: 'mini' }, CATEGORIES[k]?.label || k, numInput(profile.budgets, k, { step: '1' })))));
}

let idealsCat = 'hoodie';
function idealsSection() {
  const box = h('div');
  const draw = () => {
    const spec = profile.ideals[idealsCat];
    fill(box, 
      h('p', { class: 'hint' }, 'Garment-measurement targets the fit math uses (cm). “Ideal” = sweet spot; “OK” = still acceptable. Started from your body + BTS hoodie; adjust as you learn.'),
      h('select', { onchange: e => { idealsCat = e.target.value; draw(); } },
        Object.keys(profile.ideals).map(k => h('option', { value: k, selected: k === idealsCat ? true : null }, CATEGORIES[k]?.label || k))),
      h('div', { class: 'table-scroll' }, h('table', { class: 'edit' },
        h('tr', {}, h('th', {}, ''), h('th', {}, 'Ideal min'), h('th', {}, 'Ideal max'), h('th', {}, 'OK min'), h('th', {}, 'OK max'), h('th', {}, 'Weight')),
        Object.entries(spec).map(([k, d]) => h('tr', {}, h('td', {}, DIMS[k]?.label.split(' (')[0] || k),
          ...[['ideal', 0], ['ideal', 1], ['ok', 0], ['ok', 1]].map(([f, i]) => h('td', {}, h('input', { type: 'number', step: '0.5', value: d[f][i], onchange: e => { d[f][i] = Number(e.target.value); persistProfile(); } }))),
          h('td', {}, h('input', { type: 'number', step: '0.5', value: d.weight, onchange: e => { d.weight = Number(e.target.value); persistProfile(); } })))))),
      h('button', { class: 'ghost small', onclick: () => { profile.ideals[idealsCat] = clone(DEFAULT_PROFILE.ideals[idealsCat]); persistProfile(); draw(); } }, 'Restore defaults for this category'));
  };
  draw();
  return h('details', { class: 'card' }, h('summary', {}, 'Fit targets (advanced)'), box);
}

// ---------- SETTINGS ----------
function renderSettings() {
  const s = settings;
  const save = () => { saveSettings(s); toast('Saved'); };
  const key = h('input', { type: 'password', autocomplete: 'off', placeholder: 'sk-ant-…', value: s.apiKey, onchange: e => { s.apiKey = e.target.value.trim(); save(); } });
  add(main, 
    h('h2', { class: 'section-title' }, 'Settings'),
    h('div', { class: 'card' },
      h('label', {}, 'Anthropic API key'),
      h('div', { class: 'row' }, key, h('button', { class: 'ghost small', onclick: () => { key.type = key.type === 'password' ? 'text' : 'password'; } }, 'Show')),
      h('p', { class: 'hint' }, 'Get one at console.anthropic.com → API keys (needs billing credit). It is stored only in this browser on this device and sent only to api.anthropic.com. Set a monthly spend limit in the Console for peace of mind.'),
      h('button', { class: 'ghost', onclick: async e => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Testing…';
        try {
          const { default: Anthropic } = await import('../vendor/anthropic-sdk-0.127.0.mjs');
          const c = new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true });
          await c.models.retrieve(s.model);
          toast('Key works ✓');
        } catch (err) { toast(`Key test failed: ${err.message}`); }
        btn.disabled = false; btn.textContent = 'Test key';
      } }, 'Test key')),
    h('div', { class: 'card' },
      h('label', {}, 'Model'),
      h('select', { onchange: e => { s.model = e.target.value; save(); } },
        [['claude-opus-5-5', 'Claude Opus 5.5 — most accurate (default)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 — about half the cost']]
          .map(([v, l]) => h('option', { value: v, selected: v === s.model ? true : null }, l))),
      h('label', {}, 'Thoroughness'),
      h('select', { onchange: e => { s.effort = e.target.value; save(); } },
        [['low', 'Quick'], ['medium', 'Balanced (default)'], ['high', 'Thorough']].map(([v, l]) => h('option', { value: v, selected: v === s.effort ? true : null }, l))),
      h('label', {}, 'Shopping country'),
      h('input', { value: s.country, maxlength: 2, onchange: e => { s.country = e.target.value.toUpperCase().slice(0, 2); save(); } }),
      h('label', {}, 'Alternatives to find'),
      h('input', { type: 'number', min: 2, max: 6, value: s.maxAlternatives, onchange: e => { s.maxAlternatives = Number(e.target.value); save(); } })),
    h('div', { class: 'card' }, h('h3', {}, 'About'),
      h('p', { class: 'hint' }, 'Verdict = 60% fit math (garment measurements vs your targets and reference garments) + 40% style match (fabric/drape, branding, color, aesthetic, value — judged by the AI against your style profile). A hard tightness problem caps the score at 60. Pricing: Opus 5.5 $4/$20 per million input/output tokens, Sonnet 5.5 $2/$10, web search $10 per 1,000 searches; the cost shown after each check is an estimate.'),
      h('p', { class: 'hint' }, 'Install on iPhone: Safari → Share → Add to Home Screen.')),
  );
}

// ---------- boot ----------
go('check');
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Expose for debugging in the console.
window.__fit = { profile: () => profile, verdictFor };
