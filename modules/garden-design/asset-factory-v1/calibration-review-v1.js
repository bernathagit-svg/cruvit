/**
 * Calibration review sheet. Signed Garden photo is injected at runtime by the
 * authenticated host. This file never embeds the private URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { IN_GARDEN_SCALES, RUNTIME_BLEND_EXPERIMENT, RUNTIME_BLEND_V1, RUNTIME_BLEND_V2, IN_GARDEN_REVIEW_FIELDS } from './in-garden-qa-v1.js';
import {
  LOCAL_SCENE_MATCH_BOUNDS,
  SCENE_DEPTHS,
  SIZE_EVIDENCE_UNKNOWN,
  auditBotanicalSizeEvidence,
  blendV2FilterCss,
  buildDesignAssetScaleContract,
  evaluateTreeScaleModel,
  extractPlantLibraryCopy,
  recommendCompositionV2Class,
  buildCompositionV2Report
} from './composition-calibration-v2.js';
import {
  TREE_SCALE_MULTIPLIER_RANGE,
  TREE_SCENE_DEPTHS,
  buildTreeScaleV3Report,
  evaluateMatureTreeAntiMiniatureInvariant,
  recommendCompositionV3Class
} from './composition-calibration-v3.js';
import {
  classifyCalibrationReviewReadiness,
  LOCAL_SUPPLEMENTARY_BACKGROUNDS,
  SAVED_GARDEN_PHOTO_AUTHORITY
} from './garden-photo-review-path-v1.js';
import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';
import {
  CALIBRATION_BATCH_1_CACHE_BUST,
  CALIBRATION_BATCH_1_CANDIDATES,
  CALIBRATION_BATCH_1_LIVE_BASE,
  calibrationCandidateRepoPath
} from './calibration-review-candidates-v1.js';

export const CALIBRATION_REVIEW_BACKGROUNDS = Object.freeze({
  savedGardenDesignSourcePhoto: SAVED_GARDEN_PHOTO_AUTHORITY,
  representativeLocal: LOCAL_SUPPLEMENTARY_BACKGROUNDS,
  methodHarnessOlive: 'modules/garden-design/assets/plants/olive-tree/variants/summer-mature.png'
});

export const CALIBRATION_REVIEW_LIVE_REL = 'modules/garden-design/calibration-review.html';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sceneAttrs(attrs = {}) {
  return Object.entries(attrs)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => ` ${esc(key)}="${esc(value)}"`)
    .join('');
}

function placementCutout(src, slug, extraClass) {
  if (!src) return '';
  return `<div class="placement" data-role="placement"><img class="cutout ${esc(extraClass || '')}" src="${esc(src)}" alt="${esc(slug)} candidate" data-review-role="calibration-candidate" data-approval-status="candidate"/><span class="ground-shadow" aria-hidden="true"></span></div>`;
}

function sceneBlock(letter, label, className, scale, slug, backgroundUrl, blocked, cutoutSrc, cutoutScale, extras = {}) {
  const bg = backgroundUrl
    ? ` style="background-image:url('${esc(backgroundUrl)}')"`
    : '';
  const cutout = extras.placement
    ? placementCutout(cutoutSrc, slug, cutoutScale || '')
    : cutoutSrc
      ? candidateImg(cutoutSrc, slug, cutoutScale || '')
      : '';
  const ghost = cutout
    ? ''
    : blocked
      ? `<div class="ghost blocked">${esc(slug)} · waiting for host signed URL</div>`
      : `<div class="ghost ${esc(scale || '')}">${esc(slug)}</div>`;
  return `<div class="scene-col" data-panel="${esc(letter)}">
      <p class="cap"><strong>${esc(letter)}.</strong> ${esc(label)}</p>
      <div class="scene ${className}${blocked ? ' is-blocked' : ''}"${bg}${sceneAttrs(extras.attrs || {})}>${ghost}${cutout}</div>
    </div>`;
}

function candidateImg(src, slug, extraClass) {
  if (!src) return '';
  return `<img class="cutout ${esc(extraClass || '')}" src="${esc(src)}" alt="${esc(slug)} candidate" data-review-role="calibration-candidate" data-approval-status="candidate"/>`;
}

function candidateSrc(job, options, rel) {
  if (!job || !job.candidateRelPath) return '';
  const posix = String(job.candidateRelPath).replace(/\\/g, '/');
  const file = posix.split('/').pop();
  const bust = options.cacheBust ? `?v=${esc(options.cacheBust)}` : '';
  if (options.candidateBase) return `${options.candidateBase}${file}${bust}`;
  return `${rel(posix)}${bust}`;
}

function ownerVisualQaPanel(job) {
  const slug = esc(job.canonicalSlug);
  const fields = IN_GARDEN_REVIEW_FIELDS.map(
    (field) =>
      `<label class="field"><input type="checkbox" data-field="${esc(field)}"/> ${esc(field.toLowerCase().replace(/_/g, ' '))}</label>`
  ).join('');
  return `<aside class="owner-visual-qa" data-slug="${slug}" data-botanical-identity-qa="UNKNOWN" data-asset-qa="UNKNOWN">
  <p class="qa-split"><strong>OWNER_VISUAL_QA</strong> session-only · <strong>ROUND_1_CLASS</strong> separate · <strong>BOTANICAL_IDENTITY_QA</strong> UNKNOWN · <strong>ASSET_QA</strong> UNKNOWN</p>
  <p class="note">Visual verdict is not botanical identity and does not write the production registry. approvalStatus stays candidate.</p>
  <p class="note" data-owner-visual-status>OWNER_VISUAL_QA = UNREVIEWED. BOTANICAL_IDENTITY_QA = UNKNOWN. ASSET_QA = UNKNOWN. approvalStatus = candidate. Session-only.</p>
  <div class="verdicts" role="group" aria-label="Visual verdict">
    <button type="button" data-verdict="GOOD">GOOD</button>
    <button type="button" data-verdict="NEEDS_BLEND">NEEDS BLEND</button>
    <button type="button" data-verdict="REJECT">REJECT</button>
  </div>
  <div class="fields">${fields}</div>
  <p class="note">ROUND_1_CLASS is not GOOD / NEEDS_BLEND / REJECT. Classify only after RAW vs BLEND V1 on the real Garden photo. Not production approval.</p>
  <p class="note">BLEND_SOLVABLE: structure, perspective, silhouette, and scale are acceptable; Blend V1 fixes integration. REGEN_REQUIRED: perspective, silhouette/architecture, or inherent scale/framing is wrong. REJECT_IDENTITY: wrong botanical identity / genus.</p>
  <div class="verdicts" role="group" aria-label="Round 1 class">
    <button type="button" data-learning-class="BLEND_SOLVABLE" disabled>BLEND_SOLVABLE</button>
    <button type="button" data-learning-class="REGEN_REQUIRED" disabled>REGEN_REQUIRED</button>
    <button type="button" data-learning-class="REJECT_IDENTITY" disabled>REJECT_IDENTITY</button>
  </div>
  <p class="note">COMPOSITION class is not production approval. RUNTIME_SCALE_SOLVABLE: architecture is acceptable; only scene size is wrong. RUNTIME_SOLVABLE: sticker/tone/ground/scene scale. REGEN_REQUIRED: silhouette, inherent perspective, or crown/body proportion is wrong.</p>
  <p class="note" data-v2-recommendation></p>
  <div class="verdicts" role="group" aria-label="Composition V2 class">
    <button type="button" data-composition-v2-class="RUNTIME_SCALE_SOLVABLE" disabled>RUNTIME_SCALE_SOLVABLE</button>
    <button type="button" data-composition-v2-class="RUNTIME_SOLVABLE" disabled>RUNTIME_SOLVABLE</button>
    <button type="button" data-composition-v2-class="REGEN_REQUIRED" disabled>REGEN_REQUIRED</button>
  </div>
</aside>`;
}

export function buildCalibrationReviewHtml(batch = [], options = {}) {
  const readiness = classifyCalibrationReviewReadiness(options.savedGardenPhoto || {});
  const rel = (p) => (options.assetPrefix ? `${options.assetPrefix}${p}` : `../../${p}`);
  const gardenE = rel(LOCAL_SUPPLEMENTARY_BACKGROUNDS[0].file);
  const gardenF = rel(LOCAL_SUPPLEMENTARY_BACKGROUNDS[1].file);
  const olive = rel(CALIBRATION_REVIEW_BACKGROUNDS.methodHarnessOlive);
  const blend = RUNTIME_BLEND_EXPERIMENT.aids;
  const shadow = blend.contactShadow;
  const blendFilter = `brightness(${blend.brightness}) contrast(${blend.contrast}) saturate(${blend.saturation}) blur(${blend.edgeSofteningPx}px) drop-shadow(0 ${shadow.offsetYPx}px ${shadow.blurPx}px rgba(0,0,0,${shadow.opacity}))`;
  const v1 = RUNTIME_BLEND_V1.aids;
  const v1Shadow = v1.contactShadow;
  const blendV1Filter = `brightness(${v1.brightness}) contrast(${v1.contrast}) saturate(${v1.saturation}) blur(${v1.edgeSofteningPx}px) drop-shadow(0 ${v1Shadow.offsetYPx}px ${v1Shadow.blurPx}px rgba(0,0,0,${v1Shadow.opacity}))`;
  const blendV2Filter = blendV2FilterCss();
  const plantsBySlug = options.plantsBySlug || {};
  const libraryCopyBySlug = options.libraryCopyBySlug || {};
  const treeScale = evaluateTreeScaleModel();
  const treeV3 = evaluateMatureTreeAntiMiniatureInvariant();
  const generatedCount = batch.filter((j) => j.candidateRelPath).length;
  const heading = generatedCount
    ? `Calibration review — ${batch.length} jobs, ${generatedCount} candidates for owner visual review`
    : 'Calibration review — 8 jobs, no generation';

  function v2SceneAttrs(job, extra = {}) {
    const plant = plantsBySlug[job.canonicalSlug] || {};
    const sizeEvidence = auditBotanicalSizeEvidence(plant, libraryCopyBySlug[job.canonicalSlug] || {});
    const contract = buildDesignAssetScaleContract(job, sizeEvidence);
    const bbox = contract.intrinsicBoundingBox;
    return {
      'data-visual-form': job.visualForm || '',
      'data-growth-stage': job.growthStage || 'mature',
      'data-size-evidence': sizeEvidence.status,
      'data-ground-anchor': `${contract.groundAnchor.nx},${contract.groundAnchor.ny}`,
      'data-canvas': `${contract.canvasWidth},${contract.canvasHeight}`,
      'data-bbox': bbox ? `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}` : '',
      'data-depth-id': extra.depthId || 'middle',
      'data-scale-model': extra.scaleModel || 'v2',
      ...(extra.lockDepth ? { 'data-lock-depth': extra.lockDepth } : {})
    };
  }

  const bySlug = Object.fromEntries((Array.isArray(batch) ? batch : []).map((job) => [job.canonicalSlug, job]));
  const cards = batch
    .map((job) => {
      const title = `${job.rank}. ${esc(job.canonicalSlug)} · ${esc(job.visualForm)} · ${esc(job.growthStage)}`;
      const cutout = candidateSrc(job, options, rel);
      const generated = Boolean(cutout);
      const plant = plantsBySlug[job.canonicalSlug] || {};
      const sizeEvidence = auditBotanicalSizeEvidence(plant, libraryCopyBySlug[job.canonicalSlug] || {});
      const contract = buildDesignAssetScaleContract(job, sizeEvidence);
      const recommendation = recommendCompositionV3Class(job.canonicalSlug) || recommendCompositionV2Class(job.canonicalSlug);
      const status = generated
        ? 'Candidate binary: CANDIDATE ONLY. ASSET_QA = UNKNOWN. BOTANICAL_IDENTITY_QA = UNKNOWN. IN_GARDEN_QA = UNKNOWN. Owner visual review required. Do not auto-approve.'
        : 'Candidate binary: NOT GENERATED. ASSET_QA = UNKNOWN. IN_GARDEN_QA = BLOCKED until the real Garden photo loads.';
      const compareSlugs = [
        { slug: 'mango', label: 'mango tree' },
        { slug: 'lavender', label: 'lavender shrub' },
        { slug: 'pineapple', label: 'pineapple rosette' },
        { slug: 'banana', label: 'banana clump' }
      ];
      const formCompare =
        job.canonicalSlug === 'mango' && generated
          ? `<h3>Form relative scale — same Garden photo, middle depth</h3>
  <p class="note">Tree uses V3. Shrub / rosette / clump keep V2 form factors. Not derived from PNG pixel height. Goal: the tree must feel structurally larger.</p>
  <div class="scenes">
    ${compareSlugs
      .map((row) => {
        const other = bySlug[row.slug];
        const otherSrc = other ? candidateSrc(other, options, rel) : '';
        const scaleModel = row.slug === 'mango' ? 'v3' : 'v2';
        const extraClass = row.slug === 'mango' ? 'real blend-v2-scene tree-v3-scene form-compare-scene' : 'real blend-v2-scene form-compare-scene';
        return sceneBlock(
          row.label,
          `${row.label} · ${scaleModel}`,
          extraClass,
          'middle',
          row.slug,
          '',
          true,
          otherSrc,
          'blend-v2',
          { placement: true, attrs: v2SceneAttrs(other || { canonicalSlug: row.slug, visualForm: other && other.visualForm }, { depthId: 'middle', lockDepth: 'middle', scaleModel }) }
        );
      })
      .join('\n    ')}
  </div>`
          : '';
      const treeBlock =
        job.visualForm === 'tree' && generated
          ? `<h3>Tree scale V2 vs V3 — existing ${esc(job.canonicalSlug)} binary, no regeneration</h3>
  <p class="note">Owner question: Does this finally read as a mature tree, not a miniature tree? V2 used the shared shrub-capable curve and sized the PNG canvas. V3 is tree-only, bbox-compensated, with gentler depth falloff. TREE_SCALE_V3: ${esc(treeV3.result)}. V2 model: ${esc(treeScale.result)}.</p>
  <p class="note">TREE SCALE MULTIPLIER is calibration-only for mango. Proposed default ${TREE_SCALE_MULTIPLIER_RANGE.proposedDefault}. Range ${TREE_SCALE_MULTIPLIER_RANGE.min}–${TREE_SCALE_MULTIPLIER_RANGE.max}. Not a locked universal value until owner review.</p>
  <label>TREE SCALE MULTIPLIER <input type="range" data-tree-scale-multiplier min="${TREE_SCALE_MULTIPLIER_RANGE.min}" max="${TREE_SCALE_MULTIPLIER_RANGE.max}" step="${TREE_SCALE_MULTIPLIER_RANGE.step}" value="${TREE_SCALE_MULTIPLIER_RANGE.proposedDefault}"/> <strong data-tree-scale-multiplier-value>${TREE_SCALE_MULTIPLIER_RANGE.proposedDefault.toFixed(2)}</strong></label>
  <p class="note" data-v3-scale-readout>V3 visual aid only, not cm</p>
  <h4>CURRENT V2</h4>
  <div class="scenes">
    ${sceneBlock('V2 NEAR', 'CURRENT V2 — near', 'real blend-v2-scene perspective-scene', 'near', job.canonicalSlug, '', true, cutout, 'blend-v2', { placement: true, attrs: v2SceneAttrs(job, { depthId: 'near', lockDepth: 'near', scaleModel: 'v2' }) })}
    ${sceneBlock('V2 MIDDLE', 'CURRENT V2 — middle', 'real blend-v2-scene perspective-scene', 'middle', job.canonicalSlug, '', true, cutout, 'blend-v2', { placement: true, attrs: v2SceneAttrs(job, { depthId: 'middle', lockDepth: 'middle', scaleModel: 'v2' }) })}
    ${sceneBlock('V2 FAR', 'CURRENT V2 — far', 'real blend-v2-scene perspective-scene', 'far', job.canonicalSlug, '', true, cutout, 'blend-v2', { placement: true, attrs: v2SceneAttrs(job, { depthId: 'far', lockDepth: 'far', scaleModel: 'v2' }) })}
  </div>
  <h4>TREE SCALE V3</h4>
  <div class="scenes">
    ${sceneBlock('V3 NEAR', 'TREE SCALE V3 — near', 'real blend-v2-scene tree-v3-scene', 'near', job.canonicalSlug, '', true, cutout, 'blend-v2', { placement: true, attrs: v2SceneAttrs(job, { depthId: 'near', lockDepth: 'near', scaleModel: 'v3' }) })}
    ${sceneBlock('V3 MIDDLE', 'TREE SCALE V3 — middle', 'real blend-v2-scene tree-v3-scene', 'middle', job.canonicalSlug, '', true, cutout, 'blend-v2', { placement: true, attrs: v2SceneAttrs(job, { depthId: 'middle', lockDepth: 'middle', scaleModel: 'v3' }) })}
    ${sceneBlock('V3 FAR', 'TREE SCALE V3 — far', 'real blend-v2-scene tree-v3-scene', 'far', job.canonicalSlug, '', true, cutout, 'blend-v2', { placement: true, attrs: v2SceneAttrs(job, { depthId: 'far', lockDepth: 'far', scaleModel: 'v3' }) })}
  </div>
  ${formCompare}`
          : '';
      return `<article class="job" id="job-${esc(job.canonicalSlug)}" data-visual-form="${esc(job.visualForm || '')}" data-size-evidence="${esc(sizeEvidence.status)}">
  <header>
    <h2>${title}</h2>
    <p class="meta">${esc(job.scientific || '')} · ${esc(job.identityPrecision)} · ${esc(job.variantKey)} · ${esc(job.priorityReason)}</p>
    <p class="why">${esc(job.whyUsefulForCalibration)}</p>
    <p class="meta">A asset structural proportion · B scene scale/perspective · C visual integration. Size evidence: ${esc(sizeEvidence.status)}. Ground anchor: ${contract.groundAnchor.nx.toFixed(3)}, ${contract.groundAnchor.ny.toFixed(3)}. PNG ${contract.canvasWidth}×${contract.canvasHeight} is not botanical size. Recommended class (not approval): ${esc(recommendation.class)}.</p>
    <p class="empty" data-in-garden-status="${generated ? 'UNKNOWN' : 'BLOCKED'}" data-generated="${generated ? 'true' : 'false'}">${status}</p>
    ${generated ? ownerVisualQaPanel(job).replace('data-v2-recommendation></p>', `data-v2-recommendation>Recommended ${esc(recommendation.class)} — ${esc(recommendation.note)} Not auto-approved.</p>`) : ''}
    <p class="meta">Review fields: ${esc(IN_GARDEN_REVIEW_FIELDS.join(', '))}. Approval: ASSET_QA = PASS AND IN_GARDEN_QA = PASS. IN_GARDEN_QA may be PASS only when the real persisted Garden photo was used. Owner visual acceptance is not botanical identity PASS.</p>
  </header>
  <div class="previews">
    ${sceneBlock('A', 'transparent / checkerboard', 'checkerboard-scene', '', job.canonicalSlug, '', false, cutout, '')}
  </div>
  <h3>Real Garden photo (host signed URL)</h3>
  <div class="scenes">
    ${sceneBlock('B', 'REAL Garden photo — small', 'real', 'small', job.canonicalSlug, '', true, cutout, 'small')}
    ${sceneBlock('C', 'REAL Garden photo — medium', 'real', 'medium', job.canonicalSlug, '', true, cutout, 'medium')}
    ${sceneBlock('D', 'REAL Garden photo — large plausible', 'real', 'large', job.canonicalSlug, '', true, cutout, 'large')}
  </div>
  <h3>RAW vs BLEND V1 vs BLEND V2 (existing binary, runtime only)</h3>
  <p class="note">Owner question: Does this now look like a plant actually standing in the garden? Blend V2 is CSS + local scene matching only. No AI. Garden photo is not altered. Binary is not baked. Default comparison scale: medium. Blend V2 then uses perspective-aware scale with a manual owner control.</p>
  <div class="verdicts" role="group" aria-label="RAW vs BLEND scale">
    <button type="button" data-blend-scale="small">small</button>
    <button type="button" data-blend-scale="medium" aria-pressed="true">medium</button>
    <button type="button" data-blend-scale="large">large</button>
  </div>
  <div class="scenes raw-blend-pair raw-blend-v2-row">
    ${sceneBlock('RAW', 'RAW — real Garden photo', 'real', 'medium', job.canonicalSlug, '', true, cutout, 'medium')}
    ${sceneBlock('BLEND V1', 'BLEND V1 — real Garden photo', 'real blend-v1-scene', 'medium', job.canonicalSlug, '', true, cutout, 'medium blend-v1')}
    ${sceneBlock('BLEND V2', 'BLEND V2 — real Garden photo', 'real blend-v2-scene', 'medium', job.canonicalSlug, '', true, cutout, 'blend-v2', { placement: true, attrs: v2SceneAttrs(job) })}
  </div>
  <p class="note">Blend V2 controls (calibration only). Ground position / botanical relative scale / owner scale. SIZE_EVIDENCE = ${esc(sizeEvidence.status)}. Form factor uses visualForm, not PNG pixels and not invented meters.</p>
  <label>Depth <select data-v2-depth>
    <option value="near">near-ground</option>
    <option value="middle" selected>middle</option>
    <option value="far">far</option>
  </select></label>
  <label>Owner scale <input type="range" data-v2-owner-scale min="0.5" max="1.6" step="0.02" value="1"/></label>
  <p class="note" data-v2-scale-readout>visual aid only, not cm</p>
  ${treeBlock}
  <h3>Supplementary local scenes (not sufficient alone)</h3>
  <div class="scenes">
    ${sceneBlock('E', 'supplementary local scene 1', 'supp', 'medium', job.canonicalSlug, gardenE, false, cutout, 'medium')}
    ${sceneBlock('F', 'supplementary local scene 2', 'supp', 'medium', job.canonicalSlug, gardenF, false, cutout, 'medium')}
  </div>
  <h3>Raw vs runtime blend (experiment only, not permanent)</h3>
  <div class="raw-blend">
    <figure><figcaption>RAW</figcaption><div class="slot checkerboard">${cutout ? candidateImg(cutout, job.canonicalSlug, '') : '<span>empty</span>'}</div></figure>
    <figure><figcaption>RUNTIME BLEND</figcaption><div class="slot checkerboard ${cutout ? 'blend-slot' : ''}">${cutout ? candidateImg(cutout, job.canonicalSlug, 'blend') : '<span>CSS only · not baked · does not alter source photo</span>'}</div></figure>
  </div>
</article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Design Asset Factory — Calibration review (8 jobs)</title>
  <style>
    :root { font-family: "DM Sans", sans-serif; color: #122; }
    body { margin: 24px; background: #f4f1ea; padding-top: 56px; }
    .scene { width: 280px; height: 200px; background-size: cover; background-position: center; position: relative; border: 1px solid #ccc; background-color: #2a2a2a; overflow: hidden; }
    .scene.real { width: 420px; height: 300px; }
    .scene.real.tree-v3-scene { width: 480px; height: 360px; }
    .checkerboard-scene { width: 280px; height: 360px; }
    .scene img.cutout, .checkerboard-scene img.cutout { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%); max-height: 88%; max-width: 78%; object-fit: contain; object-position: bottom center; }
    .scene img.cutout.small { max-height: 34%; }
    .scene img.cutout.medium { max-height: 54%; }
    .scene img.cutout.large { max-height: 78%; }
    .scene .placement { position: absolute; left: 50%; bottom: 6%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; width: 80%; pointer-events: none; }
    .scene .placement img.cutout { position: relative; left: auto; bottom: auto; transform: none; max-width: 100%; object-fit: contain; object-position: bottom center; }
    .scene .placement .ground-shadow { width: 55%; height: 8px; margin-top: -4px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(0,0,0,.32) 0%, rgba(0,0,0,0) 72%); pointer-events: none; }
    .owner-visual-qa { margin: 12px 0; padding: 12px; border: 1px solid #cbb; background: #fbf8f2; }
    .owner-visual-qa .verdicts { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .owner-visual-qa button { padding: 8px 12px; border: 1px solid #888; background: #fff; cursor: pointer; }
    .owner-visual-qa button[aria-pressed="true"] { background: #0f3d2e; color: #fff; border-color: #0f3d2e; }
    .owner-visual-qa .fields { display: flex; flex-wrap: wrap; gap: 8px 14px; }
    .owner-visual-qa .note, .qa-split { font-size: 13px; color: #444; }
    h1 { font-size: 22px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .job { background: #fff; border: 1px solid #ddd; margin: 24px 0; padding: 16px; }
    .meta, .why, .empty, .cap { font-size: 13px; color: #444; }
    .empty { color: #8a2b2b; }
    .previews, .scenes, .raw-blend { display: flex; gap: 12px; flex-wrap: wrap; }
    .slot { width: 200px; height: 280px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 12px; position: relative; overflow: hidden; }
    .checkerboard, .checkerboard-scene { background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
    .checkerboard-scene { border: 1px solid #ccc; position: relative; }
    .scene.is-blocked { outline: 2px solid #c44; }
    .ghost { position: absolute; left: 50%; bottom: 12%; transform: translateX(-50%); background: rgba(255,255,255,.55); padding: 4px 6px; font-size: 10px; }
    .ghost.small { width: 18%; height: 28%; }
    .ghost.medium { width: 28%; height: 44%; }
    .ghost.large { width: 40%; height: 62%; }
    .ghost.blocked { width: 80%; text-align: center; }
    .harness img.cutout { height: 55%; position: absolute; left: 52%; bottom: 10%; transform: translateX(-50%); }
    .slot img.cutout { position: absolute; left: 50%; bottom: 6%; transform: translateX(-50%); max-height: 88%; max-width: 80%; object-fit: contain; object-position: bottom center; }
    .slot.blend-slot img.cutout, .slot img.cutout.blend { filter: ${blendFilter}; }
    .scene.real img.cutout.blend-v1, .scene.blend-v1-scene img.cutout.blend-v1 { filter: ${blendV1Filter}; }
    .scene.blend-v2-scene img.cutout.blend-v2, .scene.perspective-scene img.cutout.blend-v2, .scene.fixed-scale-v2-scene img.cutout.blend-v2 { filter: ${blendV2Filter}; }
    .harness.blend img.cutout { filter: ${blendFilter}; }
    .scene.harness { width: 280px; height: 180px; }
    code { font-size: 12px; }
    .owner-feedback { overflow: auto; }
    .owner-feedback table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .owner-feedback th, .owner-feedback td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    .owner-feedback pre { white-space: pre-wrap; background: #111; color: #f4f1ea; padding: 12px; font-size: 12px; }
    #copy-owner-feedback-summary, #download-round-1-final { margin: 8px 8px 8px 0; padding: 8px 12px; }
  </style>
</head>
<body>
  <h1>${esc(heading)}</h1>
  <p id="realGardenBanner" class="warn">Loading Garden context… Path: garden_designs.source_media_id → garden_media → private ${esc(
    SAVED_GARDEN_PHOTO_AUTHORITY.storageBucket
  )}. Local stand-ins are supplementary only. Do not copy the private photo into the repo. No Storage credentials in this page.</p>
  <p>Owner question: Does this now look like a plant actually standing in the garden? Fields: ${esc(
    IN_GARDEN_REVIEW_FIELDS.join(', ')
  )}.</p>
  <p id="composition-v2-sample-status" class="note">LOCAL SCENE MATCHING: waiting for signed Garden photo. Bounds brightness ${LOCAL_SCENE_MATCH_BOUNDS.brightness.min}–${LOCAL_SCENE_MATCH_BOUNDS.brightness.max}, contrast ${LOCAL_SCENE_MATCH_BOUNDS.contrast.min}–${LOCAL_SCENE_MATCH_BOUNDS.contrast.max}, saturate ${LOCAL_SCENE_MATCH_BOUNDS.saturate.min}–${LOCAL_SCENE_MATCH_BOUNDS.saturate.max}, blur ${LOCAL_SCENE_MATCH_BOUNDS.blurPx.min}–${LOCAL_SCENE_MATCH_BOUNDS.blurPx.max}px, opacity ${LOCAL_SCENE_MATCH_BOUNDS.opacity.min}–${LOCAL_SCENE_MATCH_BOUNDS.opacity.max}, hue-rotate 0. Depths: ${Object.keys(SCENE_DEPTHS).join(', ')}.</p>
  <p class="note">Tree scale V2 (shared curve): ${esc(treeScale.result)}. Tree scale V3 (tree-only, bbox-compensated): ${esc(treeV3.result)}. Depths V3 near/middle/far factors ${TREE_SCENE_DEPTHS.near.depthFactor} / ${TREE_SCENE_DEPTHS.middle.depthFactor} / ${TREE_SCENE_DEPTHS.far.depthFactor}. Owner question for mango: Does this finally read as a mature tree, not a miniature tree? approved assets: 0. production registry changed: NO.</p>
  <section class="job owner-feedback" id="owner-feedback-summary">
    <h2>Owner review summary</h2>
    <p class="note">Reads the current <code>cruvit:calibration-batch-1-owner-visual-qa</code> sessionStorage record. Does not clear it. Does not write the production registry. Frequencies are sums of checked fields in that record. Flattened reports are not used.</p>
    <p id="owner-feedback-integrity" class="warn">OWNER_FEEDBACK_INTEGRITY_FAILED until exact sessionStorage records for all 8 jobs are present.</p>
    <p>
      <button type="button" id="copy-owner-feedback-summary">Copy review summary</button>
      <button type="button" id="download-round-1-final">Download round-1 final snapshot</button>
      <span id="owner-feedback-copy-status"></span>
    </p>
    <table>
      <thead>
        <tr>
          <th>canonicalSlug</th>
          <th>OWNER_VISUAL_QA</th>
          <th>checked fields</th>
          <th>ROUND_1_CLASS</th>
          <th>BOTANICAL_IDENTITY_QA</th>
          <th>ASSET_QA</th>
          <th>IN_GARDEN_QA</th>
        </tr>
      </thead>
      <tbody id="owner-feedback-table-body"></tbody>
    </table>
    <h3>Frequencies from sessionStorage</h3>
    <pre id="owner-feedback-frequencies">{}</pre>
    <h3>Prompt Factory V2 learning</h3>
    <p id="owner-feedback-prompt-map" class="note">Not finalized until integrity OK and all 8 ROUND_1_CLASS values exist. REGEN_REQUIRED fields only feed generation corrections.</p>
    <h3>Exact sessionStorage JSON</h3>
    <pre id="owner-feedback-json">{}</pre>
  </section>
  ${cards}
  <section class="job">
    <h2>Method harness (not a calibration candidate)</h2>
    <p class="meta">Approved olive cutout on supplementary local backgrounds only. Proves layout + CSS blend toggle. Not a substitute for the real saved garden photo.</p>
    <label><input type="checkbox" id="blendToggle"/> Show runtime-blend experiment (CSS only, not permanent, does not alter the garden photo)</label>
    <div class="scenes">
      <div class="scene harness raw" style="background-image:url('${gardenE}')"><img class="cutout" src="${olive}" alt="olive raw"/></div>
      <div class="scene harness raw" style="background-image:url('${gardenF}')"><img class="cutout" src="${olive}" alt="olive raw"/></div>
      <div class="scene harness blend" style="background-image:url('${gardenE}')"><img class="cutout" src="${olive}" alt="olive blend"/></div>
      <div class="scene harness blend" style="background-image:url('${gardenF}')"><img class="cutout" src="${olive}" alt="olive blend"/></div>
    </div>
  </section>
  <p>Scales: ${IN_GARDEN_SCALES.join(', ')}. Runtime blend permanently implemented: false. Alter garden photo: false. AI/inpainting: false. Readiness before host inject: ${esc(
    readiness.status
  )}.</p>
  <script>
    (function () {
      var MESSAGE_TYPE = ${JSON.stringify(CALIBRATION_SOURCE_MESSAGE_TYPE)};
      function applySignedUrl(url) {
        if (!url || !/^https:\\/\\//i.test(url)) return false;
        document.documentElement.setAttribute('data-calibration-ui-status', 'REAL_GARDEN_SOURCE_LOADED');
        try { document.dispatchEvent(new CustomEvent('calibration-ui-status', { detail: { uiStatus: 'REAL_GARDEN_SOURCE_LOADED' } })); } catch (e) {}
        document.querySelectorAll('.scene.real').forEach(function (el) {
          el.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
          el.classList.remove('is-blocked');
          var ghost = el.querySelector('.ghost');
          if (ghost && !el.querySelector('img.cutout')) {
            ghost.classList.remove('blocked');
            ghost.textContent = 'Candidate not generated yet';
          }
        });
        var banner = document.getElementById('realGardenBanner');
        if (banner) {
          banner.className = 'ok';
          banner.textContent = 'Real saved Garden Design source photo loaded via temporary signed URL. Bytes were not copied into the repo.';
        }
        document.querySelectorAll('[data-in-garden-status]').forEach(function (el) {
          el.setAttribute('data-in-garden-status', 'UNKNOWN');
          if (el.getAttribute('data-generated') === 'true') return;
          el.textContent = 'Candidate not generated yet. ASSET_QA = UNKNOWN. IN_GARDEN_QA = UNKNOWN.';
        });
        return true;
      }
      function applyUiStatus(d) {
        var status = (d && (d.uiStatus || d.code)) || '';
        if (status) {
          document.documentElement.setAttribute('data-calibration-ui-status', status);
          try { document.dispatchEvent(new CustomEvent('calibration-ui-status', { detail: { uiStatus: status } })); } catch (e) {}
        }
        if (d && d.sourceMediaUrl && applySignedUrl(d.sourceMediaUrl)) return;
        var banner = document.getElementById('realGardenBanner');
        if (!banner) return;
        var labels = {
          LOADING_GARDEN_CONTEXT: 'Loading Garden context…',
          LOADING_GARDEN_PHOTO: 'Loading Garden photo…',
          REAL_GARDEN_SOURCE_LOADED: 'Real Garden photo loaded.',
          AUTH_REQUIRED: 'AUTH_REQUIRED — sign in to load the saved Garden photo.',
          NO_ACTIVE_GARDEN: 'NO_ACTIVE_GARDEN — select an active garden.',
          DESIGN_SELECTION_REQUIRED: 'DESIGN_SELECTION_REQUIRED — select the active Garden Design. Latest is not chosen automatically.',
          SOURCE_PHOTO_UNAVAILABLE: 'SOURCE_PHOTO_UNAVAILABLE — saved Garden Design source photo was not found.',
          SIGNED_URL_FAILED: 'SIGNED_URL_FAILED — could not create a temporary signed URL.'
        };
        if (!status || !labels[status]) return;
        banner.className = status === 'REAL_GARDEN_SOURCE_LOADED' ? 'ok' : 'warn';
        banner.textContent = labels[status];
        if (status !== 'REAL_GARDEN_SOURCE_LOADED') {
          document.querySelectorAll('[data-in-garden-status]').forEach(function (el) {
            el.setAttribute('data-in-garden-status', 'INVALID_FOR_THIS_SESSION');
            if (el.getAttribute('data-generated') === 'true') {
              el.textContent = 'Candidate binary: CANDIDATE ONLY. ASSET_QA = UNKNOWN. BOTANICAL_IDENTITY_QA = UNKNOWN. IN_GARDEN_QA = INVALID_FOR_THIS_SESSION. OWNER_VISUAL_QA remains valid. Do not score IN_GARDEN_QA from black B/C/D panels.';
            }
          });
        }
      }
      window.addEventListener('message', function (ev) {
        if (ev.origin && ev.origin !== 'null' && ev.origin !== window.location.origin) return;
        var d = ev.data;
        if (!d || d.type !== MESSAGE_TYPE) return;
        applyUiStatus(d);
      });
      if (window.__CRUVIT_GARDEN_SOURCE_SIGNED_URL__) applySignedUrl(window.__CRUVIT_GARDEN_SOURCE_SIGNED_URL__);
      var toggle = document.getElementById('blendToggle');
      if (toggle) {
        toggle.addEventListener('change', function () {
          document.querySelectorAll('.harness.blend').forEach(function (el) {
            el.style.display = toggle.checked ? 'block' : 'none';
          });
        });
      }
      document.querySelectorAll('.harness.blend').forEach(function (el) { el.style.display = 'none'; });
    })();
  </script>
  <script type="module" src="asset-factory-v1/calibration-owner-visual-qa-v1.js?v=${CALIBRATION_BATCH_1_CACHE_BUST}"></script>
  <script type="module" src="asset-factory-v1/composition-calibration-v2-runtime.js?v=${CALIBRATION_BATCH_1_CACHE_BUST}"></script>
</body>
</html>`;
}

export function attachExistingCalibrationCandidates(batch = [], root = process.cwd()) {
  return (Array.isArray(batch) ? batch : []).map((job) => {
    const row = CALIBRATION_BATCH_1_CANDIDATES.find((c) => c.canonicalSlug === job.canonicalSlug);
    if (!row) return job;
    const relPath = calibrationCandidateRepoPath(row.file);
    const abs = path.join(root, ...relPath.split('/'));
    if (!fs.existsSync(abs)) return job;
    return {
      ...job,
      candidateRelPath: relPath,
      generated: true,
      assetQa: job.assetQa || 'UNKNOWN',
      inGardenQa: job.inGardenQa || 'UNKNOWN'
    };
  });
}

function loadCompositionV2Catalog(root) {
  const appHtml = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const seedRaw = JSON.parse(
    fs.readFileSync(path.join(root, 'data', 'plants.seed.json'), 'utf8').replace(/^\uFEFF/, '')
  );
  const plants = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  const plantsBySlug = Object.fromEntries(
    plants.map((plant) => [String(plant.slug || '').toLowerCase(), plant])
  );
  const libraryCopyBySlug = {};
  for (const row of CALIBRATION_BATCH_1_CANDIDATES) {
    libraryCopyBySlug[row.canonicalSlug] = extractPlantLibraryCopy(appHtml, row.canonicalSlug);
  }
  return { plantsBySlug, libraryCopyBySlug };
}

export function writeCalibrationReviewSheet(root, batch, options = {}) {
  const withCandidates = attachExistingCalibrationCandidates(batch, root);
  const catalog = loadCompositionV2Catalog(root);
  const htmlOptions = {
    ...options,
    plantsBySlug: catalog.plantsBySlug,
    libraryCopyBySlug: catalog.libraryCopyBySlug
  };
  const liveHtml = buildCalibrationReviewHtml(withCandidates, {
    ...htmlOptions,
    assetPrefix: '../../',
    candidateBase: CALIBRATION_BATCH_1_LIVE_BASE,
    cacheBust: CALIBRATION_BATCH_1_CACHE_BUST
  });
  const dataHtml = buildCalibrationReviewHtml(withCandidates, {
    ...htmlOptions,
    assetPrefix: '../../../',
    candidateBase: `../../../${CALIBRATION_BATCH_1_LIVE_BASE.replace(/^assets/, 'modules/garden-design/assets')}`,
    cacheBust: CALIBRATION_BATCH_1_CACHE_BUST
  });
  const dir = path.join(root, 'data', 'garden-design', 'calibration-batch-1');
  fs.mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, 'owner-review.html');
  fs.writeFileSync(htmlPath, dataHtml);
  const livePath = path.join(root, ...CALIBRATION_REVIEW_LIVE_REL.split('/'));
  fs.mkdirSync(path.dirname(livePath), { recursive: true });
  fs.writeFileSync(livePath, liveHtml);
  const report = buildCompositionV2Report(withCandidates, catalog);
  const reportPath = path.join(dir, 'composition-calibration-v2.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const mangoJob = withCandidates.find((job) => job.canonicalSlug === 'mango') || {};
  const v3Report = buildTreeScaleV3Report({
    bbox: mangoJob.technicalQa && mangoJob.technicalQa.metrics && mangoJob.technicalQa.metrics.bbox
  });
  const v3Path = path.join(dir, 'tree-scale-calibration-v3.json');
  fs.writeFileSync(v3Path, `${JSON.stringify(v3Report, null, 2)}\n`);
  return {
    htmlPath,
    livePath,
    reportPath,
    v3Path,
    treeScale: report.treeScale.result,
    treeScaleV3: v3Report.invariant.result,
    sizeEvidenceUnknown: report.assets.every(
      (asset) => asset.sizeEvidence.matureHeightM === SIZE_EVIDENCE_UNKNOWN
    ),
    readiness: classifyCalibrationReviewReadiness(options.savedGardenPhoto || {})
  };
}
