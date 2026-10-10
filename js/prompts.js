// Prompt text and response parsing shared by the API path (ai.js) and the
// free "Copy for Claude" path, which pastes the same prompt into the Claude app.
// No SDK import here, so it loads without the API bundle.

import { CATEGORIES } from './fit.js';

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

export function systemPrompt(profile) {
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

export { ITEM_SCHEMA_TEXT };

export const ALT_SCHEMA_TEXT = `{
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

const JSON_TAG = 'Finish with ONLY the JSON object below inside <json></json> tags';

export function itemTask({ text, imageCount = 0, category }, jsonInstruction = JSON_TAG) {
  return `Evaluate this item for me.${category ? ` Category hint: ${category}.` : ''}

${text ? `What I sent:\n${text}\n` : ''}${imageCount ? `I attached ${imageCount} screenshot(s)/photo(s) — read every size chart, price, fabric and product detail in them.\n` : ''}
Steps: identify the exact product; get its full size chart (fetch the link if given, otherwise search); note fabric, weight, fit, branding and price; judge it against my profile.

${jsonInstruction}:
${ITEM_SCHEMA_TEXT}`;
}

export function altTask({ baseItem, request, n = 4, country = 'US', budget = null }, jsonInstruction = 'Finish with ONLY this JSON inside <json></json> tags') {
  const prompt = baseItem
    ? `I was looking at this item:\n${JSON.stringify({ brand: baseItem.brand, name: baseItem.name, category: baseItem.category, price: baseItem.price, fabric: baseItem.fabric, fit: baseItem.fit_description, cons: baseItem.cons, red_flags: baseItem.red_flags })}\n\nFind ${n} BETTER alternatives for me: same purpose, better fit for my body and proportions (use my reference garments' measurements), my aesthetic and fabric preferences${budget ? `, ideally ≤ $${budget}` : ', better value'}. Fix whatever was wrong with the original.${request ? `\nExtra request: ${request}` : ''}`
    : `Find me the ${n} best options for: ${request}\nThey must fit my body/proportions (use my reference garments' measurements), aesthetic, colors and budget.`;
  return `${prompt}

Rules: currently sold at established retailers in ${country}; real product pages (give the URL); look up each candidate's real size chart; don't recommend anything you couldn't verify exists. Prefer variety across brands. Put the strongest pick first.

${jsonInstruction}:
${ALT_SCHEMA_TEXT}`;
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

export function sanitizeItem(obj) {
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

// Parse a pasted Claude reply into either one item or a list of alternatives.
export function parseReply(text) {
  const obj = extractJSON(text || '');
  if (!obj) return null;
  if (Array.isArray(obj.alternatives)) {
    return { kind: 'alternatives', alternatives: obj.alternatives.filter(a => a && a.item).map(a => ({ ...sanitizeItem(a), why: a.why || '' })), notes: obj.search_notes || '' };
  }
  if (obj.item) return { kind: 'item', item: sanitizeItem(obj) };
  return null;
}

// Free path: one self-contained message to paste into the Claude app.
const CHAT_JSON = 'When you are done, reply with ONE ```json code block (not an artifact or file) containing valid JSON (no comments) in exactly this shape';

export function chatItemPrompt(profile, input) {
  return `${systemPrompt(profile)}

---

${itemTask(input, CHAT_JSON)}`;
}

export function chatAltPrompt(profile, input) {
  return `${systemPrompt(profile)}

---

${altTask(input, CHAT_JSON)}`;
}
