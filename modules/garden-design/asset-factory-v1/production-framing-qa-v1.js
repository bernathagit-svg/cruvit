/**
 * Production framing QA for Garden Design cutouts.
 * Pure/local. No network, no paid calls, no mutation.
 */
export const PRODUCTION_FRAMING_QA_VERSION = 'production-framing-qa-v1';

export const FRAMING_QA_DEFAULTS = Object.freeze({
  minTopPaddingRatio: 0.025,
  minSidePaddingRatio: 0.0125,
  minBottomPaddingRatio: 0.005,
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
  if (derived.topPaddingRatio < cfg.minTopPaddingRatio) reasons.push('top-padding-too-small');
  if (derived.leftPaddingRatio < cfg.minSidePaddingRatio) reasons.push('left-padding-too-small');
  if (derived.rightPaddingRatio < cfg.minSidePaddingRatio) reasons.push('right-padding-too-small');
  if (derived.bottomPaddingRatio < cfg.minBottomPaddingRatio) reasons.push('bottom-padding-too-small');
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
