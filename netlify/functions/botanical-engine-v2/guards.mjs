import { normalizeText, text } from './utils.mjs';

const PLANT_WORD_RE = /\b(plant|tree|flower|fruit|species|genus|family|shrub|vine|herb|berry|citrus|grass|cactus|succulent|orchid|cultivar|flora|conifer|fern|moss|palm|vegetable|plantae)\b|צמח|עץ|פרח|פרי|שיח|מטפס|עשב|קקטוס|סוקולנט|סחלב|שרך|דקל/i;

const NON_PLANT_WORD_RE = /\b(actor|actress|singer|musician|dj|artist|politician|footballer|basketball|person|human|film|movie|song|album|company|software|city|village|surname|given name|journalist|writer|director|producer|model|athlete|rabbi|professor|lawyer|brand|band|keyboard|television|series)\b|זמר|זמרת|שחקן|שחקנית|מוזיקאי|דיגיי|אמן|פוליטיקאי|כדורגלן|סופר|במאי|שם פרטי|שם משפחה|יישוב|עיר|חברה|סרט|שיר|אלבום|מקלדת|סדרה/i;

export function looksScientificName(value) {
  return /\b[A-Z][a-z-]+\s+[a-z][a-z-]+\b/.test(text(value));
}

export function looksBotanicalText(value) {
  const source = Array.isArray(value)
    ? value.join(' ')
    : typeof value === 'object' && value
      ? Object.values(value).join(' ')
      : String(value ?? '');
  if (!source.trim()) return false;
  if (NON_PLANT_WORD_RE.test(source) && !PLANT_WORD_RE.test(source) && !looksScientificName(source)) return false;
  return PLANT_WORD_RE.test(source) || looksScientificName(source);
}

export function isObviouslyNonPlant(value) {
  const source = Array.isArray(value) ? value.join(' ') : String(value ?? '');
  return NON_PLANT_WORD_RE.test(source) && !PLANT_WORD_RE.test(source) && !looksScientificName(source);
}

export function gbifItemIsPlant(item) {
  if (!item) return false;
  const kingdom = normalizeText(item.kingdom);
  return item.kingdomKey === 6 || kingdom === 'plantae';
}

export function profilePassesFinalGate(profile) {
  if (!profile || profile.isPlant === false) return false;
  const source = [
    profile.commonName,
    profile.scientificName,
    profile.guide,
    profile.imageSearchQuery,
    profile.source
  ].filter(Boolean).join(' ');
  return !isObviouslyNonPlant(source);
}
