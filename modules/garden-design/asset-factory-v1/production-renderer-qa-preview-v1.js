/**
 * Production Renderer QA Preview Adapter V1
 *
 * Builds a read-only Garden Design preview payload for a candidate asset.
 * Rendering itself is owned by modules/garden-design/index.html.
 * This adapter never writes registry, placements, or botanical truth.
 */
import { derivePresentationSizing } from './presentation-sizing-v1.js';

export const PRODUCTION_RENDERER_QA_PREVIEW_VERSION = 'production-renderer-qa-preview-v1';

export const QA_PREVIEW_POSITION_BY_FORM = Object.freeze({
  tree: Object.freeze({ x: 0.56, y: 0.86 }),
  'herbaceous-clump': Object.freeze({ x: 0.72, y: 0.82 }),
  'herbaceous-upright': Object.freeze({ x: 0.62, y: 0.84 }),
  rosette: Object.freeze({ x: 0.56, y: 0.86 }),
  shrub: Object.freeze({ x: 0.58, y: 0.85 }),
  default: Object.freeze({ x: 0.58, y: 0.85 })
});

function asText(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function visualFormOf(row = {}) {
  const explicit = asText(row.visualForm);
  if (explicit) return explicit;
  if (asText(row.architectureMode) === 'tree') return 'tree';
  return asText(row.architectureMode) || 'default';
}

function qaPosition(form) {
  return QA_PREVIEW_POSITION_BY_FORM[form] || QA_PREVIEW_POSITION_BY_FORM.default;
}

function validAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object') return false;
  return Boolean(
    Number(anchor.baseWidthPx) > 0
    && Number(anchor.scale) > 0
    && Number.isFinite(Number(anchor.x))
    && Number.isFinite(Number(anchor.y))
  );
}

export function buildProductionRendererQaPreview(row = {}, options = {}) {
  const metrics = row.technicalMetrics || row.metrics || {};
  const form = visualFormOf(row);

  const presentation = derivePresentationSizing({
    visualForm: form,
    architectureMode: row.architectureMode,
    width: metrics.width || row.width,
    height: metrics.height || row.height,
    alphaBBox: metrics.bbox || row.alphaBBox
  });

  const anchor = options.savedPlacementAnchor || null;
  const useAnchor = validAnchor(anchor);
  const pos = useAnchor ? anchor : qaPosition(form);

  const baseWidthPx = useAnchor
    ? Number(anchor.baseWidthPx)
    : Number(presentation.baseWidthPx);

  if (!(baseWidthPx > 0)) {
    return Object.freeze({
      ok: false,
      code: 'QA_PREVIEW_PRESENTATION_BLOCKED',
      jobId: row.jobId || null,
      canonicalSlug: row.canonicalSlug || null,
      presentation,
      registryWrites: 0,
      persistenceWrites: 0
    });
  }

  return Object.freeze({
    ok: true,
    code: useAnchor ? 'QA_PREVIEW_SAVED_PRODUCTION_ANCHOR' : 'QA_PREVIEW_PRESENTATION_BASELINE',
    version: PRODUCTION_RENDERER_QA_PREVIEW_VERSION,
    jobId: row.jobId || null,
    canonicalSlug: row.canonicalSlug || null,
    scientific: row.scientific || null,
    visualForm: form,
    architectureMode: row.architectureMode || null,
    growthStage: row.growthStage || 'unspecified',
    phenology: row.phenology || 'vegetative',
    width: Number(metrics.width || row.width || 0),
    height: Number(metrics.height || row.height || 0),
    baseWidthPx,
    scale: useAnchor ? Number(anchor.scale) : 1,
    x: Number(pos.x),
    y: Number(pos.y),
    rotation: 0,
    authorityUserResized: useAnchor && anchor.authorityUserResized === true,
    source: useAnchor ? 'saved-production-placement' : 'promotion-presentation-sizing',
    presentation,
    renderingOwner: 'Garden Design production renderer',
    independentQaScaleMath: false,
    registryWrites: 0,
    persistenceWrites: 0
  });
}

export const PRODUCTION_RENDERER_QA_PREVIEW_GOVERNANCE = Object.freeze({
  rendererOwner: 'modules/garden-design/index.html',
  independentQaScaleRendererForbidden: true,
  hardcodedSpeciesBaseWidthForbidden: true,
  promotionPresentationSizingReused: true,
  savedProductionPlacementMayOverridePresentationBaseline: true,
  qaPositionIsNotBotanicalTruth: true
});
