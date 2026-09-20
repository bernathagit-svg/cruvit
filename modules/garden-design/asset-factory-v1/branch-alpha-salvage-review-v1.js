/**
 * Zero-spend BRANCH alpha salvage review harness. Diagnostic previews only.
 */
import fs from 'node:fs';
import path from 'node:path';

export const BRANCH_ALPHA_SALVAGE_REVIEW_LIVE_REL = 'modules/garden-design/branch-alpha-salvage-feasibility-1.html';

const RUN_ID = 'design-asset-branch-alpha-salvage-1';
const OWNER_MARKS = [
  'SALVAGE_LOOKS_CLEAN',
  'TWIGS_DESTROYED',
  'HAZE_REMAINS',
  'BRANCHES_THICKENED',
  'HALO',
  'DEAD_APPEARANCE',
  'OTHER'
];

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
  if (value.startsWith('modules/garden-design/')) return value.slice('modules/garden-design/'.length);
  return value;
}

function markButtons(arm) {
  return `<div class="marks" data-mark-group="detail" data-arm="${esc(arm)}">
    ${OWNER_MARKS.map((mark) => `<button type="button" data-mark="${esc(mark)}">${esc(mark)}</button>`).join('')}
  </div>`;
}

function inspectSlot(arm, label, src, note) {
  const inner = src
    ? `<div class="inspect-frame">
        <img class="inspect-cutout" alt="${esc(label)}" src="${esc(src)}" draggable="false"/>
      </div>
      <p class="inspect-tools">
        <button type="button" data-inspect-zoom="fit">Fit</button>
        <button type="button" data-inspect-zoom="100">100%</button>
        <button type="button" data-inspect-zoom="150">150%</button>
        <button type="button" data-inspect-zoom="200">200%</button>
        filter:none. No blend.
      </p>
      ${markButtons(arm)}`
    : `<div class="ghost blocked">NOT GENERATED — ${esc(arm)}</div>`;
  return `<div class="slot inspect-slot" data-arm="${esc(arm)}" data-review-mode="NATIVE_DETAIL">
    <p class="cap">${esc(label)}</p>
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
  const controlSrc = liveCutoutSrc(summary.originals.CONTROL.file);
  const newSrc = liveCutoutSrc(summary.originals.NEW.file);
  const exp = Object.fromEntries((summary.experiments || []).map((row) => [row.id, row]));
  const diag = summary.solidBackgroundDiagnostics || {};
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>BRANCH alpha salvage feasibility</title>
  <style>
    body { margin: 0; font: 16px/1.45 Inter, system-ui, sans-serif; background: #f4f1ea; color: #222; }
    h1, h2, h3 { margin: 16px 20px 8px; }
    p, ul { margin: 8px 20px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 10px 12px; }
    .ok { background: #e7f6ea; border: 1px solid #2a6; padding: 10px 12px; }
    .note { color: #555; font-size: 13px; }
    .slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; padding: 12px 20px 28px; }
    .slot { background: #fff; border: 1px solid #ddd; padding: 10px; }
    .checkerboard { background-image: linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%); background-size: 24px 24px; background-position: 0 0, 0 12px, 12px -12px, -12px 0; overflow: auto; min-height: 420px; }
    .inspect-100 img { width: auto; height: auto; image-rendering: auto; }
    .inspect-150 img { width: auto; transform: scale(1.5); transform-origin: bottom center; }
    .inspect-200 img { width: auto; transform: scale(2); transform-origin: bottom center; }
    .inspect-fit img { max-width: 100%; max-height: 520px; }
    .inspect-cutout, [data-review-mode="NATIVE_DETAIL"] img { filter: none !important; }
    .inspect-frame { min-height: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .marks { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .marks button[aria-pressed="true"] { background: #a33; color: #fff; }
    .metrics { font-size: 13px; }
    button { padding: 6px 10px; cursor: pointer; }
    .cap { font-size: 14px; font-weight: 600; }
  </style>
</head>
<body data-run-id="${esc(RUN_ID)}" data-owner-qa-storage="cruvit:branch-alpha-salvage-1">
  <h1>BRANCH alpha salvage feasibility V1</h1>
  <p class="warn">Zero spend. Originals locked. Derived diagnostics only. Do not production-approve. Spend gate DENIED.</p>
  <p class="note">runId ${esc(RUN_ID)}. RGB result ${esc(summary.rgbStructureResult)}. Salvage verdict ${esc(summary.salvageVerdict)}. HIGH not executed.</p>
  <h2>Owner question</h2>
  <p>Can deterministic alpha cleanup make the dormant tree look clean and natural without destroying real branches?</p>
  <h3>NATIVE ORIGINALS + CLEANUPS</h3>
  <div class="slots inspect-row">
    ${inspectSlot('CONTROL', 'CONTROL ORIGINAL — NOT APPROVED', controlSrc, 'Detail V2 + medium. Historical control. Do not modify.')}
    ${inspectSlot('NEW', 'NEW ORIGINAL', newSrc, 'Branch Structure V2 + medium. Provider failure unchanged.')}
    ${inspectSlot('CLEANUP_A', 'NEW CLEANUP A', exp.A ? liveCutoutSrc(exp.A.file) : '', exp.A ? exp.A.label : 'not run')}
    ${inspectSlot('CLEANUP_B', 'NEW CLEANUP B', exp.B ? liveCutoutSrc(exp.B.file) : '', exp.B ? exp.B.label : 'not run')}
    ${inspectSlot('CLEANUP_C', 'NEW CLEANUP C', exp.C ? liveCutoutSrc(exp.C.file) : '', exp.C ? exp.C.label : 'not run')}
  </div>
  <h3>Cleanup metrics</h3>
  ${(summary.experiments || [])
    .map((row) => `<h4>${esc(row.id)}. ${esc(row.label)}</h4>${metricList(row.metrics)}`)
    .join('') || '<p class="note">Cleanup not justified.</p>'}
  <h3>RGB without alpha</h3>
  <div class="slots">
    ${inspectSlot('CONTROL_RGB', 'CONTROL RGB (alpha ignored)', diag.control ? liveCutoutSrc(diag.control.rgbNoAlpha) : '', 'Shows provider RGB including leftover transparent samples.')}
    ${inspectSlot('NEW_RGB', 'NEW RGB (alpha ignored)', diag.new ? liveCutoutSrc(diag.new.rgbNoAlpha) : '', 'If the crown is a brown smear here, RGB is not clean.')}
  </div>
  <h3>Solid-background composites (diagnostics only)</h3>
  <div class="slots">
    ${inspectSlot('NEW_WHITE', 'NEW over white', diag.new ? liveCutoutSrc(diag.new.overWhite) : '', 'diagnostic')}
    ${inspectSlot('NEW_BLACK', 'NEW over black', diag.new ? liveCutoutSrc(diag.new.overBlack) : '', 'diagnostic')}
    ${inspectSlot('NEW_GRAY', 'NEW over gray', diag.new ? liveCutoutSrc(diag.new.overGray) : '', 'diagnostic')}
    ${inspectSlot('NEW_CHECK', 'NEW over checker', diag.new ? liveCutoutSrc(diag.new.overChecker) : '', 'diagnostic')}
    ${inspectSlot('CONTROL_WHITE', 'CONTROL over white', diag.control ? liveCutoutSrc(diag.control.overWhite) : '', 'diagnostic')}
    ${inspectSlot('CONTROL_BLACK', 'CONTROL over black', diag.control ? liveCutoutSrc(diag.control.overBlack) : '', 'diagnostic')}
    ${inspectSlot('CONTROL_GRAY', 'CONTROL over gray', diag.control ? liveCutoutSrc(diag.control.overGray) : '', 'diagnostic')}
    ${inspectSlot('CONTROL_CHECK', 'CONTROL over checker', diag.control ? liveCutoutSrc(diag.control.overChecker) : '', 'diagnostic')}
  </div>
  <p class="note">Do not treat derived previews as Design Assets. Do not auto-run HIGH. Do not change production registry.</p>
  <script type="module" src="./asset-factory-v1/branch-alpha-salvage-review-runtime.js"></script>
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
