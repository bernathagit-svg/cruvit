/**
 * Index for Plant Knowledge & Warnings 60-plant enrichment.
 */
export { BATCH1_ENRICHMENT_PLANTS } from './plants/batch1.mjs';
export { BATCH2_ENRICHMENT_PLANTS } from './plants/batch2.mjs';
export {
  ENRICHMENT_SET_ID,
  ENRICHMENT_VERIFIED_AT,
  PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION
} from './shared.mjs';

import { BATCH1_ENRICHMENT_PLANTS } from './plants/batch1.mjs';
import { BATCH2_ENRICHMENT_PLANTS } from './plants/batch2.mjs';

export const ENRICHMENT_60_PLANTS = Object.freeze([
  ...BATCH1_ENRICHMENT_PLANTS,
  ...BATCH2_ENRICHMENT_PLANTS
]);
