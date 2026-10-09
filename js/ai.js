// Claude-powered product reading and alternative search.
// Runs directly from the browser with the user's own API key (stored only on
// this device). Server-side web_search / web_fetch tools do the browsing.

import Anthropic from '../vendor/anthropic-sdk-0.127.0.mjs';
import { CATEGORIES } from './fit.js';

const PRICES = { // USD per million tokens [input, output, cacheRead]
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.2],
};
const WEB_SEARCH_COST = 0.01; // $10 per 1,000 searches

export class AIError extends Error {}

function client(settings) {
  if (!settings.apiKey) throw new AIError('Add your Anthropic API key in Settings to use AI features.');
  return new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

const CATEGORY_KEYS = Object.keys(CATEGORIES);

const SIZE_SCHEMA_TEXT = `"sizes": [ {
    "size": "M",
    "source": "official" | "estimated",
    "measurements": {            // GARMENT measurements in cm (convert inches ×2.54). Omit unknown keys.
      "chestFlat": 0,            // pit-to-pit, laid flat (half circumference)
      "length": 0,               // body length, high point shoulder/back neck to hem
      "shoulder": 0,             // seam to seam
      "sleeve": 0,               // shoulder seam to cuff
      "sleeveCB": 0,             // center-back neck to cuff (use for raglan / when that's what the chart gives)
      "bicepFlat": 0,            // sleeve width at bicep, flat
      "waistFlat": 0, "hipFlat": 0, "thighFlat": 0, "inseam": 0, "legOpeningFlat": 0, "rise": 0
    },
    "body": {                    // ONLY if the brand gives a BODY-measurement chart instead. cm ranges [lo, hi].
      "chest": [0,0], "waist": [0,0], "hips": [0,0], "height": [0,0], "inseam": [0,0]
    }
  } ]`;

const ITEM_SCHEMA_TEXT = `{
  "item": {
    "brand": "", "name": "", "url": "", "category": one of ${JSON.stringify(CATEGORY_KEYS)},
    "price": number|null, "currency": "USD", "color_considered": "", "colors_available": [""],
    "fabric": "", "fabric_weight_gsm": number|null, "fit_description": "", "closure": "", "branding": "", "notes": ""
  },
  "waist_type": "fixed" | "elastic" | "drawstring" | null,
  ${SIZE_SCHEMA_TEXT},
  "style": {   // 0-100 each, judged against HIS preferences, with a one-sentence reason
    "fabric_drape": {"score": 0, "reason": ""},
    "branding": {"score": 0, "reason": ""},
    "color": {"score": 0, "reason": ""},
    "aesthetic": {"score": 0, "reason": ""},
    "value": {"score": 0, "reason": ""}
  },
  "ai_fit_estimate": {"score": 0, "reason": ""},   // your holistic fit guess 0-100 for his best size
  "ai_size_pick": {"size": "", "reason": ""},
  "shoe": null | {"recommended_size": "", "reason": "", "stack_height_mm": number|null, "height_boost": "", "comfort": ""},
  "red_flags": [""],          // prefix with "DEALBREAKER:" only for hard violations (e.g. jogger scrub pants for Emory, big logo he'd hate)
  "pros": [""], "cons": [""],
  "summary": "2-3 sentences, direct, like a knowledgeable friend",
  "sources": [""]
}`;

function systemPrompt(profile) {
  const b = profile.body;
  const refs = (profile.references || []).map(r =>
    `- ${r.name} — size ${r.size}, outcome: ${r.outcome}${r.measurements && Object.keys(r.measurements).length ? `, garment cm: ${JSON.stringify(r.measurements)}` : ''}${r.notes ? ` — ${r.notes}` : ''}`).join('\n');
  const log = (profile.fitLog || []).slice(-25).map(l =>
    `- ${l.date}: ${l.brand} ${l.name} size ${l.size} → ${l.outcome}${l.notes ? ` (${l.notes})` : ''}`).join('\n') || '- (none yet)';
  const shoes = (profile.shoes || []).map(s => `- ${s.model}: ${s.size || 'size not recorded'}${s.notes ? ` (${s.notes})` : ''}`).join('\n');
  const budgets = Object.entries(profile.budgets || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ≤ $${v}`).join(', ') || 'not set';

  return `You are a precise menswear fit analyst and personal shopper for one specific person. You judge whether clothing fits HIM and suits HIS taste, and you find better-value alternatives. Be honest: if something is wrong for him, say so plainly.

Today's date: ${new Date().toISOString().slice(0, 10)}. Prices, stock, size charts and product lines change — check the web rather than relying on memory, and never invent measurements. When a number is your estimate rather than the brand's published chart, mark that size "source": "estimated".

## His body (cm unless noted)
Height ${b.heightCm?.join('–')} cm (5'7"–5'8"), weight ${b.weightLb} lb (${b.weightNote || ''}), target ${b.targetWeightLb} lb. Build: ${b.build}.
Chest ${b.chest}, natural waist ${b.waist}, hips ${b.hips}, shoulder width ${b.shoulder}, torso length ~${b.torsoLength}, arm length ~${b.armLength}, biceps ${b.biceps?.join('–')}, neck ${b.neck}, thigh ${b.thigh?.join('–')}, calf ${b.calf?.join('–')}, inseam ~${b.inseamCm} cm (${b.inseamIn?.join('–')}"), wrist ${b.wrist}. Preferred top length ${b.shirtLength?.join('–')} cm.

## Garments he has actually worn (strongest evidence — compare against these)
${refs}

## Recent fit log
${log}

## Shoes
${shoes}
${profile.shoeNotes || ''}

## Budgets
${budgets}

## Style profile
${profile.style}

## How to work
- Find the brand's official size chart (garment measurements preferred). Retailer pages are often JS-heavy: if fetching a page fails, web_search for "<brand> <product> size chart" or the product name plus "measurements", and try the brand's size-guide page or major resellers.
- Convert everything to centimeters. "Chest" on garment charts is usually pit-to-pit flat; if a chart gives full circumference, halve it for chestFlat. Waist/hip/thigh/leg opening likewise flat (half).
- Include EVERY size the brand lists (XS–XXL etc.), not just his likely one.
- If only a body-measurement chart exists, fill "body" ranges instead of "measurements".
- For shoes, recommend a size using his confirmed sizes (Nike Vomero 5 = 8.5, Hoka Bondi 9 = 9) and the brand's known sizing tendencies; mention stack height / height boost if findable.
- Keep the search efficient: a few targeted searches/fetches, not dozens.`;
}

function computeCost(model, usage, acc) {
  const p = PRICES[model] || PRICES['claude-opus-5-5'];
  const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25;
  const cost = inTok / 1e6 * p[0] + (usage.output_tokens || 0) / 1e6 * p[1] + (usage.cache_read_input_tokens || 0) / 1e6 * p[2]
    + (usage.server_tool_use?.web_search_requests || 0) * WEB_SEARCH_COST;
  acc.cost += cost;
  acc.searches += usage.server_tool_use?.web_search_requests || 0;
  acc.fetches += usage.server_tool_use?.web_fetch_requests || 0;
}

// One agentic request with server-side web tools. Handles pause_turn
// continuations and refusal fallback.
async function runWithWeb(settings, profile, userContent, { onStatus, maxSearches = 6, maxFetches = 6 } = {}) {
  const c = client(settings);
  const model = settings.model || 'claude-opus-5-5';
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches, user_location: { type: 'approximate', country: settings.country || 'US' } },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: maxFetches, max_content_tokens: 25000 },
  ];
  const messages = [{ role: 'user', content: userContent }];
  const acc = { cost: 0, searches: 0, fetches: 0 };
  let useFallbacks = true;
  let response;

  for (let turn = 0; turn < 5; turn++) {
    onStatus?.(turn === 0 ? 'Researching the product and size chart…' : 'Still researching…');
    const params = {
      model,
      max_tokens: 16000,
      system: [{ type: 'text', text: systemPrompt(profile), cache_control: { type: 'ephemeral' } }],
      output_config: { effort: settings.effort || 'medium' },
      tools,
      messages,
    };
    try {
      response = useFallbacks
        ? await c.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await c.messages.create(params);
    } catch (err) {
      if (useFallbacks && err instanceof Anthropic.BadRequestError && /fallback/i.test(err.message)) {
        useFallbacks = false; turn--; continue;
      }
      throw friendlyError(err);
    }
    computeCost(model, response.usage || {}, acc);
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    break;
  }
  if (response.stop_reason === 'refusal') throw new AIError('Claude declined this request. Try rephrasing or pasting the size chart as text.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { text, acc, model: response.model };
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return new AIError('Your API key was rejected. Check it in Settings.');
  if (err instanceof Anthropic.PermissionDeniedError) return new AIError('This API key lacks permission for that model or web tools (an org admin may need to enable web search in the Claude Console).');
  if (err instanceof Anthropic.RateLimitError) return new AIError('Rate limited by the API — wait a minute and try again.');
  if (err instanceof Anthropic.BadRequestError) return new AIError(`The API rejected the request: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) return new AIError('Could not reach the Anthropic API. Check your connection.');
  if (err instanceof Anthropic.APIError) return new AIError(`API error ${err.status ?? ''}: ${err.message}`);
  return err;
}

export function extractJSON(text) {
  const tagged = text.match(/<json>([\s\S]*?)<\/json>/i);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [tagged?.[1], fenced?.[1]];
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const cand of candidates) {
    if (!cand) continue;
    try { return JSON.parse(cand); } catch { /* try without // comments */ }
    try { return JSON.parse(cand.replace(/\s\/\/[^\n"]*$/gm, '')); } catch { /* try next */ }
  }
  return null;
}

// If the model's final answer wasn't valid JSON, ask it (no tools, cheap) to reformat.
async function repairJSON(settings, text, schemaText, acc) {
  const c = client(settings);
  const model = settings.model || 'claude-opus-5-5';
  const r = await c.messages.create({
    model, max_tokens: 16000, output_config: { effort: 'low' },
    messages: [{ role: 'user', content: `Convert the following into ONE valid JSON object matching this shape (drop comments; omit unknown fields). Output only the JSON inside <json></json>.\n\nSHAPE:\n${schemaText}\n\nCONTENT:\n${text}` }],
  }).catch(e => { throw friendlyError(e); });
  computeCost(model, r.usage || {}, acc);
  return extractJSON(r.content.filter(b => b.type === 'text').map(b => b.text).join('\n'));
}

function sanitizeItem(obj) {
  const item = obj.item || {};
  if (!CATEGORIES[item.category]) item.category = 'other';
  return {
    ...item,
    waist_type: obj.waist_type ?? null,
    sizes: Array.isArray(obj.sizes) ? obj.sizes : [],
    style: obj.style || null,
    ai_fit_estimate: obj.ai_fit_estimate || null,
    ai_size_pick: obj.ai_size_pick || null,
    shoe: obj.shoe || null,
    red_flags: obj.red_flags || [],
    pros: obj.pros || [],
    cons: obj.cons || [],
    summary: obj.summary || '',
    sources: obj.sources || [],
  };
}

// Analyze one product from a link, description, and/or screenshots.
export async function analyzeItem(settings, profile, { text, images = [], category }, onStatus) {
  const content = [];
  for (const img of images) content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  content.push({ type: 'text', text:
`Evaluate this item for me.${category ? ` Category hint: ${category}.` : ''}

${text ? `What I sent:\n${text}\n` : ''}${images.length ? `I attached ${images.length} screenshot(s)/photo(s) — read every size chart, price, fabric and product detail in them.\n` : ''}
Steps: identify the exact product; get its full size chart (fetch the link if given, otherwise search); note fabric, weight, fit, branding and price; judge it against my profile.

Finish with ONLY the JSON object below inside <json></json> tags:
${ITEM_SCHEMA_TEXT}` });

  const { text: out, acc, model } = await runWithWeb(settings, profile, content, { onStatus });
  onStatus?.('Scoring sizes…');
  let obj = extractJSON(out);
  if (!obj?.item) obj = await repairJSON(settings, out, ITEM_SCHEMA_TEXT, acc);
  if (!obj?.item) throw new AIError('Could not read a structured result from the AI. Try again, or paste the size chart as a screenshot.');
  return { item: sanitizeItem(obj), usage: acc, model };
}

const ALT_SCHEMA_TEXT = `{
  "alternatives": [ {
    "item": { "brand": "", "name": "", "url": "", "category": "...", "price": number|null, "currency": "USD", "color_considered": "", "colors_available": [""], "fabric": "", "fabric_weight_gsm": number|null, "fit_description": "", "branding": "", "notes": "" },
    "waist_type": "fixed"|"elastic"|"drawstring"|null,
    ${SIZE_SCHEMA_TEXT},
    "style": { "fabric_drape": {"score":0,"reason":""}, "branding": {"score":0,"reason":""}, "color": {"score":0,"reason":""}, "aesthetic": {"score":0,"reason":""}, "value": {"score":0,"reason":""} },
    "ai_fit_estimate": {"score": 0, "reason": ""},
    "ai_size_pick": {"size": "", "reason": ""},
    "shoe": null | {"recommended_size": "", "reason": "", "stack_height_mm": number|null, "height_boost": "", "comfort": ""},
    "red_flags": [""], "pros": [""], "cons": [""],
    "why": "one sentence: why this is a better pick for him",
    "summary": ""
  } ],
  "search_notes": ""
}`;

// Find alternatives — either for an analyzed item, or from a free-form request.
export async function findAlternatives(settings, profile, { baseItem, request }, onStatus) {
  const n = Math.max(2, Math.min(6, Number(settings.maxAlternatives) || 4));
  const budget = baseItem ? profile.budgets?.[baseItem.category] : null;
  const prompt = baseItem
    ? `I was looking at this item:\n${JSON.stringify({ brand: baseItem.brand, name: baseItem.name, category: baseItem.category, price: baseItem.price, fabric: baseItem.fabric, fit: baseItem.fit_description, cons: baseItem.cons, red_flags: baseItem.red_flags })}\n\nFind ${n} BETTER alternatives for me: same purpose, better fit for my body and proportions (use my reference garments' measurements), my aesthetic and fabric preferences${budget ? `, ideally ≤ $${budget}` : ', better value'}. Fix whatever was wrong with the original.${request ? `\nExtra request: ${request}` : ''}`
    : `Find me the ${n} best options for: ${request}\nThey must fit my body/proportions (use my reference garments' measurements), aesthetic, colors and budget.`;

  const content = [{ type: 'text', text: `${prompt}

Rules: currently sold at established retailers in ${settings.country || 'US'}; real product pages (give the URL); look up each candidate's real size chart; don't recommend anything you couldn't verify exists. Prefer variety across brands. Put the strongest pick first.

Finish with ONLY this JSON inside <json></json> tags:
${ALT_SCHEMA_TEXT}` }];

  const { text: out, acc, model } = await runWithWeb(settings, profile, content, { onStatus, maxSearches: 10, maxFetches: 10 });
  onStatus?.('Scoring alternatives…');
  let obj = extractJSON(out);
  if (!Array.isArray(obj?.alternatives)) obj = await repairJSON(settings, out, ALT_SCHEMA_TEXT, acc);
  if (!Array.isArray(obj?.alternatives)) throw new AIError('Could not read alternatives from the AI response. Try again.');
  const alts = obj.alternatives.filter(a => a && a.item).map(a => ({ ...sanitizeItem(a), why: a.why || '' }));
  return { alternatives: alts, notes: obj.search_notes || '', usage: acc, model };
}

// Downscale an image file to keep tokens (and cost) down.
export async function fileToImage(file, maxDim = 1568) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
