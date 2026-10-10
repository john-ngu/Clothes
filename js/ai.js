// Claude-powered product reading and alternative search.
// Runs directly from the browser with the user's own API key (stored only on
// this device). Server-side web_search / web_fetch tools do the browsing.

import Anthropic from '../vendor/anthropic-sdk-0.127.0.mjs';
import { systemPrompt, ITEM_SCHEMA_TEXT, ALT_SCHEMA_TEXT, itemTask, altTask, extractJSON, sanitizeItem } from './prompts.js';

export { extractJSON };

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


// Analyze one product from a link, description, and/or screenshots.
export async function analyzeItem(settings, profile, { text, images = [], category }, onStatus) {
  const content = [];
  for (const img of images) content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
  content.push({ type: 'text', text: itemTask({ text, imageCount: images.length, category }) });

  const { text: out, acc, model } = await runWithWeb(settings, profile, content, { onStatus });
  onStatus?.('Scoring sizes…');
  let obj = extractJSON(out);
  if (!obj?.item) obj = await repairJSON(settings, out, ITEM_SCHEMA_TEXT, acc);
  if (!obj?.item) throw new AIError('Could not read a structured result from the AI. Try again, or paste the size chart as a screenshot.');
  return { item: sanitizeItem(obj), usage: acc, model };
}


// Find alternatives — either for an analyzed item, or from a free-form request.
export async function findAlternatives(settings, profile, { baseItem, request }, onStatus) {
  const n = Math.max(2, Math.min(6, Number(settings.maxAlternatives) || 4));
  const budget = baseItem ? profile.budgets?.[baseItem.category] : null;
  const content = [{ type: 'text', text: altTask({ baseItem, request, n, country: settings.country || 'US', budget }) }];

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
