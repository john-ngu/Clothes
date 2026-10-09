// Default profile (pre-loaded from your measurement & style document, Oct 2026)
// plus localStorage persistence. Everything here is editable in the app.

export const DEFAULT_PROFILE = {
  version: 1,
  updated: '2026-10-09',
  body: {
    gender: 'Male / menswear',
    age: 29,
    heightCm: [170, 173],
    weightLb: 168,
    weightNote: 'Recorded July 2026; usual range 168–175 lb',
    targetWeightLb: 180,
    build: 'Athletic, muscular: broad shoulders, developed arms, muscular thighs and calves',
    chest: 99,
    waist: 85,
    hips: 93,
    shoulder: 51,
    torsoLength: 52,
    armLength: 60,
    biceps: [34, 36],
    neck: 38,
    thigh: [58, 59],
    calf: [41, 42],
    inseamCm: 71,
    inseamIn: [28, 29],
    wrist: 17,
    shirtLength: [65, 67],
  },

  // Ideal and acceptable garment measurements (cm, flat where noted) per category.
  // These started as estimates from your body measurements and your perfect-fit
  // BTS hoodie (M). Tune them in Profile → Fit targets as you log real items.
  ideals: {
    hoodie: {
      length:    { ideal: [65, 68],     ok: [63, 70.5], weight: 3 },
      chestFlat: { ideal: [61, 72],     ok: [58, 74.5], weight: 3 },
      shoulder:  { ideal: [52, 58.5],   ok: [49, 61],   weight: 2 },
      reach:     { ideal: [84, 90],     ok: [81, 93],   weight: 1.5 },
      bicepFlat: { ideal: [21, 27],     ok: [19.5, 30], weight: 1 },
    },
    tshirt: {
      length:    { ideal: [65, 67.5],   ok: [63, 70],   weight: 3 },
      chestFlat: { ideal: [56, 63],     ok: [53.5, 66], weight: 3 },
      shoulder:  { ideal: [49, 56],     ok: [47, 58.5], weight: 2 },
      bicepFlat: { ideal: [20, 23.5],   ok: [19, 25],   weight: 1.5 },
    },
    longsleeve: {
      length:    { ideal: [64, 68],     ok: [62, 70],   weight: 3 },
      chestFlat: { ideal: [53, 58],     ok: [51.5, 61], weight: 3 },
      shoulder:  { ideal: [46, 52],     ok: [44.5, 55], weight: 1.5 },
      reach:     { ideal: [83, 88],     ok: [81, 91],   weight: 1.5 },
      bicepFlat: { ideal: [19, 21.5],   ok: [18.5, 23.5], weight: 1.5 },
    },
    jacket: {
      length:    { ideal: [63, 68],     ok: [61, 71],   weight: 3 },
      chestFlat: { ideal: [60, 69],     ok: [57, 72],   weight: 3 },
      shoulder:  { ideal: [50, 57],     ok: [48, 60],   weight: 2 },
      reach:     { ideal: [84, 89],     ok: [82, 92],   weight: 1.5 },
    },
    scrub_top: {
      length:    { ideal: [66, 71],     ok: [64, 74],   weight: 2 },
      chestFlat: { ideal: [53, 59],     ok: [51.5, 62], weight: 3 },
      shoulder:  { ideal: [46, 52],     ok: [44, 55],   weight: 1.5 },
    },
    casual_pants: {
      waistFlat:      { ideal: [41, 44],   ok: [39.5, 46], weight: 2.5 },
      hipFlat:        { ideal: [50, 56],   ok: [48, 60],   weight: 1.5 },
      thighFlat:      { ideal: [33, 40],   ok: [31.5, 43], weight: 3 },
      inseam:         { ideal: [70, 74.5], ok: [68, 78],   weight: 2.5 },
      legOpeningFlat: { ideal: [21, 27],   ok: [19, 31],   weight: 1.5 },
    },
    dress_pants: {
      waistFlat:      { ideal: [41, 43.5], ok: [39.5, 45.5], weight: 2.5 },
      hipFlat:        { ideal: [50, 55],   ok: [48, 58],   weight: 1.5 },
      thighFlat:      { ideal: [32, 37],   ok: [31, 40],   weight: 3 },
      inseam:         { ideal: [70, 73.5], ok: [68, 76],   weight: 2.5 },
      legOpeningFlat: { ideal: [19.5, 24], ok: [18.5, 26.5], weight: 1.5 },
    },
    sweatpants: {
      waistFlat:      { ideal: [41, 44],   ok: [39.5, 46], weight: 1.5 },
      hipFlat:        { ideal: [50, 56],   ok: [48, 59],   weight: 1 },
      thighFlat:      { ideal: [31.5, 35.5], ok: [30.5, 38], weight: 3 },
      inseam:         { ideal: [70, 74.5], ok: [68, 77],   weight: 2.5 },
      legOpeningFlat: { ideal: [17, 21],   ok: [15, 23.5], weight: 2 },
    },
    shorts: {
      waistFlat:      { ideal: [41, 44],   ok: [39.5, 46], weight: 2 },
      thighFlat:      { ideal: [32, 38],   ok: [31, 41],   weight: 3 },
      inseam:         { ideal: [13, 19],   ok: [10, 23],   weight: 2 },
    },
    scrub_pants: {
      waistFlat:      { ideal: [40, 43.5], ok: [38.5, 45.5], weight: 2 },
      hipFlat:        { ideal: [50, 55],   ok: [48, 58],   weight: 1.5 },
      thighFlat:      { ideal: [32, 37],   ok: [31, 40],   weight: 2.5 },
      inseam:         { ideal: [70, 74],   ok: [68, 76],   weight: 3 },
      legOpeningFlat: { ideal: [19, 24],   ok: [18, 26],   weight: 1 },
    },
  },

  // Garments you've actually worn. "perfect" ones become measurement anchors.
  references: [
    {
      id: 'ref-bts-hoodie',
      name: 'BTS tour zip-up hoodie (Weverse, light/washed grey)',
      category: 'hoodie', size: 'M', outcome: 'perfect',
      measurements: { length: 67.4, chestFlat: 71.2, shoulder: 56.6, sleeve: 59.7 },
      notes: 'Fit perfectly — length, hem position, relaxed look, proportions, comfort. 100% cotton loopback, oversized/boxy cut, full zip, split kangaroo pockets, ribbed waist & cuffs. Item code BTSTA26A0T511GY4 (made Jan 2026). Measurements from the official Weverse listing.',
    },
    { id: 'ref-figs-leon', name: 'FIGS Leon scrub top', category: 'scrub_top', size: 'M', outcome: 'perfect', measurements: {}, notes: 'Perfect fit.' },
    { id: 'ref-figs-pants', name: 'FIGS scrub pants', category: 'scrub_pants', size: 'M Short', outcome: 'perfect', measurements: {}, notes: 'Perfect fit.' },
    { id: 'ref-figs-cairo', name: 'FIGS Cairo scrub pants', category: 'scrub_pants', size: 'M', outcome: 'loose', measurements: {}, notes: 'Perfect length; slightly loose around waist and hips.' },
    { id: 'ref-uq-fleece-blouson', name: 'Uniqlo Fleece-Lined Blouson', category: 'jacket', size: 'M', outcome: 'too_short', measurements: {}, notes: 'Felt too short.' },
    { id: 'ref-uq-windproof', name: 'Uniqlo Windproof Stand Blouson', category: 'jacket', size: 'S', outcome: 'unknown', measurements: {}, notes: 'Considered in Small; not confirmed as best size.' },
  ],

  shoes: [
    { model: 'Nike Vomero 5', size: 'US M 8.5', notes: 'Confirmed' },
    { model: 'Hoka Bondi 9', size: 'US M 9', notes: 'Confirmed' },
    { model: 'Nike Air Force 1', size: '', notes: 'Owned; size not recorded' },
    { model: 'Converse high-tops', size: '', notes: 'Owned; size not recorded' },
  ],
  shoeNotes: 'General range US M 8.5–9 depending on brand/model. Wants snug and secure but never squeezing the toes. Foot length/width not measured yet.',

  budgets: { hoodie: 40, tshirt: null, longsleeve: null, jacket: null, casual_pants: null, dress_pants: null, sweatpants: null, shorts: null, shoes: null },

  // Free-text style profile the AI reads. Edit freely.
  style: `AESTHETIC: Japanese/Korean minimalism, elevated everyday basics, relaxed contemporary menswear, clean streetwear, minimalist athletic wear, smart casual. Clean, modern, masculine, relaxed, slightly oversized and proportional to a 5'7"–5'8" height. Stylish without trying too hard. Room to breathe but never sloppy, excessively baggy, or overwhelmed by fabric. Likes slightly cropped pieces because standard lengths run long on him.

FIT PRIORITIES (in order): 1) Proportions for 5'7"–5'8" — never make the torso look long or legs short. 2) Comfort for daily activities. 3) Natural, soft fabric drape. 4) Relaxed but intentional. 5) Right length: slightly cropped tops, proportional jackets, properly hemmed pants. 6) Minimalist: neutral colors, understated, minimal branding. 7) Versatility (lectures, everyday, outings). 8) Value — quality at a reasonable price, not paying for branding.

HOODIES (very important): relaxed and slightly oversized, slightly cropped / naturally shorter; roomy through shoulders, chest and upper arms; not tight at stomach/waist; not balloon-shaped, not excessively long, not too boxy or stiff. Hem should stop around the waist/upper hip without folding or tucking. Fabric: soft, drapey, flowy, breathable, lightweight-to-midweight, flexible; some substance so it doesn't feel cheap, but NOT heavyweight/bulky/stiff. Drape is extremely important — fabric should fall over the shoulders, arms and torso rather than stick out. No fixed fabric-composition rule; feel/drape/fit matter more than the label. Hood: generous, fully covers head, proportional to shoulders, holds its shape, not heavy, clean when worn down; dislikes small flimsy hoods. Colors: 1) dark navy 2) black 3) grey/heather grey 4) muted washed neutrals 5) understated earth tones. No logo preferred; small subtle logo OK; no big graphics/lettering. Budget ~$35–40 or less (has considered a ~$150 one but prefers better-value alternatives). Considered: A&F Essential/Heritage, American Eagle, Urban Outfitters Standard Cloth, H&M oversized zip-ups, Uniqlo, plain BTS tour-style zip hoodies.

T-SHIRTS & TOPS: relaxed, slightly oversized, slightly cropped (65–67 cm), room for chest/shoulders, sleeves that fit muscular arms, not clinging to stomach, natural drape rather than stiff and square. Soft, breathable, light/medium weight. Black, white, off-white, grey, navy, neutrals. Likes plain minimal tees, white cutoff-sleeve shirts, thermal long sleeves, Henleys, slightly cropped long sleeves. Considered: Buck Mason Natural Vintage Thermal Henley, American Eagle Fit Cozy Thermal, Uniqlo ribbed Henley, Uniqlo AIRism. Henleys/thermals should show the athletic physique without being excessively tight.

PANTS — casual: relaxed, straight or wide leg, thigh room, clean drape hip-to-ankle, little/no taper, Japanese/Korean silhouettes, pair with chunky sneakers, loafers, clogs. Not every pair excessively wide. DRESS / smart casual: relaxed straight or moderately wide, clean tailored look, thigh room, good drape, NO balloon/barrel shape; considered Uniqlo Easy Wide. ATHLETIC SWEATPANTS: athletic silhouette, straight or clean open hem, NOT excessively baggy or as wide as his Uniqlo trousers, room for muscular thighs, soft fabric, clean ankle; likes black sweatpants with a light grey or black hoodie; considered Nike open-hem brushed-fleece sweatpants. All pants: room for thighs/calves, comfortable waist, not tight at hips, inseam ~28–29" (71–74 cm), minimal stacking.

JACKETS: slightly cropped but not awkwardly short, relaxed, room for shoulders/chest, clean simple silhouette, minimal branding, layers well, not bulky, works with straight/wide pants. Likes modern blousons, simple zip jackets, casual hooded jackets. Uniqlo Fleece-Lined Blouson M felt too short. Navy, black, grey, earth tones.

SHOES: priorities 1) comfort for walking/long standing 2) noticeable but natural extra height (no obvious elevator/exaggerated platforms) 3) aesthetics 4) support & cushioning 5) versatility 6) value. Likes chunky-but-stylish and running-inspired sneakers, retro/modern athletic, white/neutral colorways: Hoka Bondi 9 (all white), Nike Vomero 5, AF1, New Balance 9060 (Castlerock), Air Max 95, Chuck 70, classic Converse (white laces). Also minimalist loafers, comfortable clogs, moc-toe and casual leather shoes with an understated height boost. Avoid toe-squeezing, poor cushioning.

SCRUBS / NURSING SCHOOL (Emory): navy scrub top & pants, Emory emblem on required top, NO jogger-style scrub pants, all-white or all-black leather/vinyl closed-heel shoes, ankle-covering socks in approved colors, thin approved neutral undershirts. Likes navy FIGS, comfortable professional fit, room to move, pants not too long, not baggy; has looked at the FIGS Cobaki jacket. Clinical shoes: comfort and cushioning for long shifts.

COLOR PALETTE: black, white, off-white, cream, grey, charcoal, dark navy, muted blue, beige, brown, olive and earth tones. Neutral, understated combos; no bright/loud outfits.

FAVORITE OUTFITS: athletic casual (light grey hoodie + black athletic sweats + white cushioned sneakers); minimal everyday (slightly cropped tee + relaxed/straight trousers + NB/Nike sneakers); smart casual (Henley/thermal + relaxed tailored trousers + loafers/clogs/minimal sneakers); relaxed streetwear (navy/black relaxed hoodie + straight/moderately wide pants + chunky neutral sneakers); layered minimalist (tee + cropped blouson/zip jacket + relaxed trousers + clean sneakers).

ACCESSORIES: simple necklaces incl. circular pendants — not too tight, not hanging too low, balanced with tees/Henleys. No hoop earrings; subtle minimal accessories. Wrist 17 cm; Apple Watch Ultra 4 — band for casual, lectures, clinicals, gym. Tattoos: left arm sleeve, right leg sleeve.

BRANDS EXPLORED: Uniqlo, Abercrombie & Fitch, American Eagle, Nike, New Balance, Hoka, Converse, Urban Outfitters, H&M, Buck Mason, The North Face, FIGS. Not brand-loyal; prefers recognizable, established retailers.

AVOID: excessively oversized silhouettes, long shirts, hoodies far below the hips, heavy bulky hoodies, stiff fabrics, tight sleeves, tight chest, balloon athletic sweats, barrel-leg trousers for dressy looks, long/bunching pants, sloppy looks, big loud logos, overpriced basics. Shoes that squeeze toes, poor cushioning, obvious elevator shoes. Hoop earrings, tight necklaces, low-hanging pendants.`,

  fitLog: [],
};

const KEYS = {
  profile: 'fitapp.profile.v1',
  settings: 'fitapp.settings.v1',
  checks: 'fitapp.checks.v1',
};

export const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'medium',
  country: 'US',
  maxAlternatives: 4,
};

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

const clone = o => JSON.parse(JSON.stringify(o));

// Fill in any fields added to the default profile after the user saved theirs.
function mergeDefaults(saved, defaults) {
  if (saved == null) return clone(defaults);
  if (Array.isArray(defaults) || typeof defaults !== 'object' || defaults === null) return saved;
  const out = { ...saved };
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in out)) out[k] = clone(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') out[k] = mergeDefaults(out[k], v);
  }
  return out;
}

export function loadProfile() { return mergeDefaults(read(KEYS.profile), DEFAULT_PROFILE); }
export function saveProfile(p) { p.updated = new Date().toISOString().slice(0, 10); return write(KEYS.profile, p); }
export function resetProfile() { return write(KEYS.profile, clone(DEFAULT_PROFILE)); }

export function loadSettings() { return { ...DEFAULT_SETTINGS, ...(read(KEYS.settings) || {}) }; }
export function saveSettings(s) { return write(KEYS.settings, s); }

export function loadChecks() { return read(KEYS.checks) || []; }
export function saveChecks(list) { return write(KEYS.checks, list.slice(0, 40)); }

export function exportAll() {
  return JSON.stringify({ exported: new Date().toISOString(), profile: loadProfile(), checks: loadChecks() }, null, 2);
}
export function importAll(json) {
  const data = JSON.parse(json);
  if (!data.profile || !data.profile.body) throw new Error('Not a Fit Check backup file');
  write(KEYS.profile, mergeDefaults(data.profile, DEFAULT_PROFILE));
  if (Array.isArray(data.checks)) write(KEYS.checks, data.checks);
}

export function uid(prefix = 'id') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
