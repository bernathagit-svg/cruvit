/**
 * Production framing QA for Garden Design cutouts.
 * Pure/local. No network, no paid calls, no mutation.
 */
export const PRODUCTION_FRAMING_QA_VERSION = 'production-framing-qa-v1.1';

export const FRAMING_QA_DEFAULTS = Object.freeze({
  minTopPaddingRatio: 0.025,
  minSidePaddingRatio: 0.0125,
  minBottomPaddingRatio: 0.005,
  edgePaddingTolerancePx: 3,
  minVisibleHeightRatio: 0.45,
  minVisibleAreaRatio: 0.08
});

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function framingMetricsFromTechnicalQa(technicalQa = {}) {
  const metrics = technicalQa.metrics || technicalQa;
  const width = finite(metrics.width);
  const height = finite(metrics.height);
  const bbox = metrics.bbox || metrics.alphaBBox || null;
  if (!width || !height || width <= 0 || height <= 0 || !bbox || bbox.exists === false) {
    return { ok: false, reason: 'framing-metrics-unavailable' };
  }
  const minX = finite(bbox.minX);
  const minY = finite(bbox.minY);
  const maxX = finite(bbox.maxX);
  const maxY = finite(bbox.maxY);
  if ([minX, minY, maxX, maxY].some((v) => v == null)) {
    return { ok: false, reason: 'framing-bbox-invalid' };
  }
  const visibleWidthPx = Math.max(0, maxX - minX + 1);
  const visibleHeightPx = Math.max(0, maxY - minY + 1);
  return {
    ok: true,
    width,
    height,
    bbox: { exists: true, minX, minY, maxX, maxY },
    topPaddingRatio: minY / height,
    leftPaddingRatio: minX / width,
    rightPaddingRatio: Math.max(0, width - 1 - maxX) / width,
    bottomPaddingRatio: Math.max(0, height - 1 - maxY) / height,
    visibleWidthRatio: visibleWidthPx / width,
    visibleHeightRatio: visibleHeightPx / height,
    visibleAreaRatio: (visibleWidthPx * visibleHeightPx) / (width * height)
  };
}

export function assessProductionFramingQa(technicalQa = {}, options = {}) {
  const cfg = { ...FRAMING_QA_DEFAULTS, ...(options.thresholds || {}) };
  const derived = framingMetricsFromTechnicalQa(technicalQa);
  if (!derived.ok) {
    return {
      version: PRODUCTION_FRAMING_QA_VERSION,
      result: 'FAIL',
      reasons: [derived.reason],
      retryable: true,
      metrics: derived
    };
  }
  const reasons = [];
  const tolerancePx = Math.max(0, Number(cfg.edgePaddingTolerancePx || 0));
  const topPaddingPx = derived.bbox.minY;
  const leftPaddingPx = derived.bbox.minX;
  const rightPaddingPx = Math.max(0, derived.width - 1 - derived.bbox.maxX);
  const bottomPaddingPx = Math.max(0, derived.height - 1 - derived.bbox.maxY);
  if (topPaddingPx + tolerancePx < cfg.minTopPaddingRatio * derived.height) reasons.push('top-padding-too-small');
  if (leftPaddingPx + tolerancePx < cfg.minSidePaddingRatio * derived.width) reasons.push('left-padding-too-small');
  if (rightPaddingPx + tolerancePx < cfg.minSidePaddingRatio * derived.width) reasons.push('right-padding-too-small');
  if (bottomPaddingPx + tolerancePx < cfg.minBottomPaddingRatio * derived.height) reasons.push('bottom-padding-too-small');
  if (derived.visibleHeightRatio < cfg.minVisibleHeightRatio) reasons.push('subject-too-small-in-canvas');
  if (derived.visibleAreaRatio < cfg.minVisibleAreaRatio) reasons.push('subject-area-too-small-in-canvas');
  return {
    version: PRODUCTION_FRAMING_QA_VERSION,
    result: reasons.length ? 'FAIL' : 'PASS',
    reasons,
    retryable: reasons.length > 0,
    thresholds: cfg,
    metrics: derived
  };
}
