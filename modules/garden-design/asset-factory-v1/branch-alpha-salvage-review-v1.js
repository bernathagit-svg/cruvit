/**
 * Zero-spend BRANCH alpha salvage review harness. Diagnostic previews only.
 */
import fs from 'node:fs';
import path from 'node:path';

export const BRANCH_ALPHA_SALVAGE_REVIEW_LIVE_REL = 'modules/garden-design/branch-alpha-salvage-feasibility-1.html';
export const BRANCH_ALPHA_SALVAGE_REVIEW_CACHE_BUST = '20260920g';

const RUN_ID = 'design-asset-branch-alpha-salvage-1';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function liveCutoutSrc(relFile) {
  const value = String(relFile || '').replace(/\\/g, '/');
  if (!value) return '';
  let src = value;
  if (src.startsWith('modules/garden-design/')) src = src.slice('modules/garden-design/'.length);
  return `${src}?v=${BRANCH_ALPHA_SALVAGE_REVIEW_CACHE_BUST}`;
}

function inspectSlot(arm, label, src, note, badge) {
  const inner = src
    ? `<div class="inspect-frame">
        <img class="inspect-cutout" alt="${esc(label)}" src="${esc(src)}" draggable="false"/>
      </div>`
    : `<div class="ghost blocked">NOT GENERATED — ${esc(arm)}</div>`;
  return `<div class="slot inspect-slot compare-card" data-arm="${esc(arm)}" data-review-mode="NATIVE_DETAIL">
    <p class="cap">${esc(label)}</p>
    ${badge ? `<p class="badge">${esc(badge)}</p>` : ''}
    <p class="note">${esc(note)}</p>
    <div class="inspect-scene inspect-100 checkerboard">${inner}</div>
  </div>`;
}

function metricList(metrics) {
  if (!metrics) return '<p class="note">No cleanup metrics.</p>';
  return `<ul class="metrics">
    <li>opaque pixel %: ${esc(metrics.opaquePixelPercent)}</li>
    <li>alpha 1–64: ${esc(metrics.ghostAlpha1to64)}</li>
    <li>alpha 65–191: ${esc(metrics.partialAlpha65to191)}</li>
    <li>alpha 192–254: ${esc(metrics.edgeAlpha192to254)}</li>
    <li>alpha 255: ${esc(metrics.opaqueAlpha255)}</li>
    <li>connected: ${esc(metrics.connectedBranchComponentRetention && metrics.connectedBranchComponentRetention.label)}</li>
    <li>thin-twig retention: ${esc(metrics.thinTwigRetentionEstimate)}</li>
    <li>haze reduction: ${esc(metrics.hazeReduction)}</li>
    <li>branch width: ${esc(metrics.branchWidthDistortion)}</li>
    <li>edge halo introduced: ${esc(metrics.edgeHaloIntroduced)}</li>
  </ul>`;
}

export function buildBranchAlphaSalvageReviewHtml(summary) {
  const originalSrc = liveCutoutSrc(summary.originals.NEW.file);
  const controlSrc = liveCutoutSrc(summary.originals.CONTROL.file);
  const exp = Object.fromEntries((summary.experiments || []).map((row) => [row.id, row]));
  const diag = summary.solidBackgroundDiagnostics || {};
  const aSrc = exp.A ? liveCutoutSrc(exp.A.file) : '';
  const bSrc = exp.B ? liveCutoutSrc(exp.B.file) : '';
  const cSrc = exp.C ? liveCutoutSrc(exp.C.file) : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>APPLE DORMANT — ALPHA CLEANUP COMPARISON</title>
  <style>
    body { margin: 0; padding: 72px 0 40px; font: 16px/1.45 Inter, system-ui, sans-serif; background: #f4f1ea; color: #222; }
    h1 { margin: 0 16px 8px; font-size: 28px; line-height: 1.15; }
    h2, h3, h4 { margin: 16px 16px 8px; }
    p, ul { margin: 8px 16px; }
    .banner { margin: 0 16px 12px; background: #111; color: #fff; padding: 10px 12px; font-weight: 700; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 10px 12px; }
    .note { color: #555; font-size: 13px; }
    .badge { display: inline-block; margin: 0 0 8px; padding: 3px 8px; background: #f4e7c3; border: 1px solid #b8860b; font-size: 12px; font-weight: 700; }
    .compare-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      padding: 8px 16px 12px;
    }
    @media (max-width: 1100px) {
      .compare-row { grid-template-columns: 1fr 1fr; }
    }
    .compare-card { background: #fff; border: 2px solid #222; padding: 10px; min-width: 0; }
    .cap { margin: 0 0 6px; font-size: 18px; font-weight: 800; line-height: 1.2; }
    .checkerboard { background-image: linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%); background-size: 24px 24px; background-position: 0 0, 0 12px, 12px -12px, -12px 0; overflow: auto; height: 520px; }
    .inspect-100 img { width: auto; height: auto; max-width: none; image-rendering: auto; }
    .inspect-150 img { width: auto; transform: scale(1.5); transform-origin: top left; }
    .inspect-200 img { width: auto; transform: scale(2); transform-origin: top left; }
    .inspect-cutout, [data-review-mode="NATIVE_DETAIL"] img { filter: none !important; }
    .inspect-frame { min-height: 100%; display: flex; align-items: flex-start; justify-content: center; }
    .zoom-bar, .choice-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 16px; }
    .choice-bar button { min-width: 92px; font-weight: 700; padding: 10px 14px; }
    .choice-bar button[aria-pressed="true"] { background: #0f3d2e; color: #fff; }
    .slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; padding: 12px 16px 28px; }
    .slot { background: #fff; border: 1px solid #ddd; padding: 10px; }
    .ghost { padding: 24px; background: rgba(255,255,255,.7); }
    .metrics { font-size: 13px; }
    button { padding: 6px 10px; cursor: pointer; }
    details { margin: 16px; border: 1px dashed #999; padding: 8px; background: #faf8f2; }
    details > summary { cursor: pointer; font-weight: 700; }
  </style>
</head>
<body data-run-id="${esc(RUN_ID)}" data-owner-qa-storage="cruvit:branch-alpha-salvage-1">
  <p class="banner">APPLE DORMANT — ALPHA CLEANUP COMPARISON</p>
  <h1>ORIGINAL vs CLEANUP A vs CLEANUP B vs CLEANUP C</h1>
  <p class="warn">SOURCE ORIGINAL is the failed provider PNG. A/B/C are derived alpha cleanups only. CALIBRATION ONLY — NOT APPROVED. Spend DENIED. No Blend. No Garden photo.</p>
  <div class="zoom-bar" data-compare-zoom>
    <span>Native inspection:</span>
    <button type="button" data-inspect-zoom="100" aria-pressed="true">100%</button>
    <button type="button" data-inspect-zoom="150">150%</button>
    <button type="button" data-inspect-zoom="200">200%</button>
    <span class="note">Default 100%. checkerboard. filter:none. No blend. No sharpening.</span>
  </div>
  <div class="compare-row" id="alphaCleanupComparison">
    ${inspectSlot('ORIGINAL', 'ORIGINAL — FAILED PROVIDER PNG', originalSrc, 'SOURCE ORIGINAL. Branch Structure V2 + medium. Not a cleanup result.', 'FAILED PROVIDER PNG')}
    ${inspectSlot('CLEANUP_A', 'CLEANUP A — CONSERVATIVE', aSrc, 'Derived preview from SOURCE ORIGINAL. Not a new generation.', 'CALIBRATION ONLY — NOT APPROVED')}
    ${inspectSlot('CLEANUP_B', 'CLEANUP B — STRONGER CLEANUP', bSrc, 'Derived preview from SOURCE ORIGINAL. Not a new generation.', 'CALIBRATION ONLY — NOT APPROVED')}
    ${inspectSlot('CLEANUP_C', 'CLEANUP C — EDGE-PRESERVING CLEANUP', cSrc, 'Derived preview from SOURCE ORIGINAL. Not a new generation.', 'CALIBRATION ONLY — NOT APPROVED')}
  </div>
  <h2>Which version looks most natural while keeping the real branches and removing the brown haze?</h2>
  <p class="note">Calibration owner preference only. This does not production-approve any asset.</p>
  <div class="choice-bar" data-owner-choice>
    <button type="button" data-choice="ORIGINAL">ORIGINAL</button>
    <button type="button" data-choice="A">A</button>
    <button type="button" data-choice="B">B</button>
    <button type="button" data-choice="C">C</button>
    <button type="button" data-choice="NONE">NONE</button>
  </div>
  <details>
    <summary>Secondary diagnostics — historical control, RGB-without-alpha, solid composites. Not the cleanup comparison.</summary>
    <h3>Historical control (previous failed Detail V2 + medium)</h3>
    <p class="note">This is NOT a cleanup variant. Kept only for archive comparison.</p>
    <div class="slots">
      ${inspectSlot('CONTROL', 'HISTORICAL CONTROL — NOT THIS COMPARISON', controlSrc, 'Previous failed V2 + medium. Do not treat as CLEANUP A/B/C.', 'ARCHIVE ONLY')}
    </div>
    <h3>Cleanup metrics</h3>
    ${(summary.experiments || [])
      .map((row) => `<h4>${esc(row.id)}. ${esc(row.label)}</h4>${metricList(row.metrics)}`)
      .join('') || '<p class="note">Cleanup not justified.</p>'}
    <h3>RGB without alpha</h3>
    <div class="slots">
      ${inspectSlot('CONTROL_RGB', 'CONTROL RGB (alpha ignored)', diag.control ? liveCutoutSrc(diag.control.rgbNoAlpha) : '', 'diagnostic', '')}
      ${inspectSlot('NEW_RGB', 'SOURCE ORIGINAL RGB (alpha ignored)', diag.new ? liveCutoutSrc(diag.new.rgbNoAlpha) : '', 'diagnostic', '')}
    </div>
    <h3>Solid-background composites</h3>
    <div class="slots">
      ${inspectSlot('NEW_WHITE', 'SOURCE ORIGINAL over white', diag.new ? liveCutoutSrc(diag.new.overWhite) : '', 'diagnostic', '')}
      ${inspectSlot('NEW_BLACK', 'SOURCE ORIGINAL over black', diag.new ? liveCutoutSrc(diag.new.overBlack) : '', 'diagnostic', '')}
      ${inspectSlot('NEW_GRAY', 'SOURCE ORIGINAL over gray', diag.new ? liveCutoutSrc(diag.new.overGray) : '', 'diagnostic', '')}
      ${inspectSlot('NEW_CHECK', 'SOURCE ORIGINAL over checker', diag.new ? liveCutoutSrc(diag.new.overChecker) : '', 'diagnostic', '')}
    </div>
  </details>
  <script type="module" src="./asset-factory-v1/branch-alpha-salvage-review-runtime.js?v=${BRANCH_ALPHA_SALVAGE_REVIEW_CACHE_BUST}"></script>
</body>
</html>
`;
}

export function writeBranchAlphaSalvageReview(root, summary) {
  const html = buildBranchAlphaSalvageReviewHtml(summary);
  const out = path.join(root, BRANCH_ALPHA_SALVAGE_REVIEW_LIVE_REL);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return { reviewPath: out };
}
