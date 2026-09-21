/**
 * Production Renderer QA Preview Adapter V1
 *
 * Builds a read-only Garden Design preview payload for a candidate asset.
 * Rendering itself is owned by modules/garden-design/index.html.
 * This adapter never writes registry, placements, or botanical truth.
 */
import { derivePresentationSizing } from './presentation-sizing-v1.js';
import { deriveSiblingStateScaleAnchor } from './in-garden-qa-scale-policy-v1.js';

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
  genericAnchorRegistryRequiredForOverrides: true,
  perJobAnchorCodeForbidden: true,
  qaPositionIsNotBotanicalTruth: true
});


export function resolveCompatibleSavedPlacementAnchor(row = {}, registry = {}) {
  const records = Array.isArray(registry?.records) ? registry.records : [];
  const targetMetrics = row.technicalMetrics || row.metrics || {};
  const target = {
    canonicalSlug: row.canonicalSlug,
    visualForm: visualFormOf(row),
    architectureMode: row.architectureMode || 'default',
    growthStage: row.growthStage,
    phenology: row.phenology || row.phenologyState,
    alphaBBox: targetMetrics.bbox || row.alphaBBox || null
  };

  for (const record of records) {
    if (!record || record.ownerApproved !== true) continue;
    const inherited = deriveSiblingStateScaleAnchor({
      canonicalSlug: record.canonicalSlug,
      visualForm: record.visualForm,
      architectureMode: record.architectureMode,
      growthStage: record.growthStage,
      phenology: record.sourcePhenology,
      baseWidthPx: record.baseWidthPx,
      savedPlacementScale: record.savedPlacementScale,
      alphaBBox: record.alphaBBox
    }, target, {
      savedPlacementScale: record.savedPlacementScale
    });
    if (!inherited.ok) continue;
    return Object.freeze({
      anchorId: record.anchorId || null,
      baseWidthPx: Number(record.baseWidthPx),
      scale: Number(record.savedPlacementScale),
      x: Number(record.x),
      y: Number(record.y),
      authorityUserResized: record.authorityUserResized === true,
      inherited,
      source: 'generic-saved-placement-anchor-registry'
    });
  }
  return null;
}


export function attachProductionRendererInputsToManifest(manifest = {}, anchorRegistry = {}) {
  const rows = (Array.isArray(manifest?.rows) ? manifest.rows : []).map((row) => {
    const savedPlacementAnchor = resolveCompatibleSavedPlacementAnchor(row, anchorRegistry);
    const preview = buildProductionRendererQaPreview(row, { savedPlacementAnchor });
    if (!preview.ok) {
      return {
        ...row,
        qaRendererInput: {
          ok: false,
          code: preview.code,
          source: null
        }
      };
    }
    return {
      ...row,
      qaRendererInput: {
        ok: true,
        code: preview.code,
        source: preview.source,
        baseWidthPx: preview.baseWidthPx,
        scale: preview.scale,
        x: preview.x,
        y: preview.y,
        rotation: preview.rotation,
        authorityUserResized: preview.authorityUserResized,
        renderingOwner: preview.renderingOwner,
        independentQaScaleMath: false
      }
    };
  });

  return {
    ...manifest,
    rendererInputContract: PRODUCTION_RENDERER_QA_PREVIEW_VERSION,
    rows
  };
}
