/**
 * Garden Design size authority integration: historical, current and qualified
 * future registries are separate read-only inputs to the same semantic checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBotanicalSizeAuthority } from '../modules/garden-design/asset-factory-v1/botanical-size-authority-v1.js';
import {
  GARDEN_SIZE_AUTHORITY_ACTIVATION,
  resolveGardenSizeAuthority,
  scaleFromGardenSizeAuthority
} from '../modules/garden-design/asset-factory-v1/garden-design-size-authority-adapter-v1.js';
import { resolvePlantSizeAuthorityReadiness } from '../modules/garden-design/asset-factory-v1/plant-size-authority-readiness-v1.js';
import { validateBotanicalRange } from '../modules/garden-design/asset-factory-v1/physical-scale-foundation-v1.js';
import { sha256, fingerprint, verifyDelta } from '../tools/size-authority/canonical-delta-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'garden-design-size-authority-adapter-v1.js');
const canonicalPath='data/catalog/botanical-size-authority-v1.json';
const currentCanonicalBefore=fs.readFileSync(path.join(ROOT,canonicalPath));
// No fetch or mutable fallback: unavailable pinned history fails this suite.
const genesisBytes=cp.execFileSync('git',['cat-file','blob','92cb4282970a6aac75e0ab88d13b2a110bbd393d:'+canonicalPath],{
  cwd:ROOT,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}
});
assert.equal(sha256(genesisBytes),'86447803a6ad2245b8422448edc91e7197481370138a582453b631131e04c90b');
const qualification=verifyDelta({inputBytes:genesisBytes,
  manifestBytes:fs.readFileSync(path.join(ROOT,'config/size-authority/canonical-deltas/000001-jaboticaba-context-state-v1.json')),
  expectedManifestSha256:'3e7e109af3758db5e0dcd14635a3141f557c63b97fa8f446496b767af0725810'});
assert.equal(sha256(qualification.receiptBytes),'10e969fbcc1cfde3b920b45bf3249f9d0104367247c74bf0a4e42e9e3ecb0d27');
assert.equal(sha256(qualification.outputBytes),'e59a63abad28a269e2ac9e1c12e72a0eb12b680cd89222c586bdf9f63c5864b6');
const historicalRegistry=JSON.parse(genesisBytes),qualifiedRegistry=JSON.parse(qualification.outputBytes);
const registryCases=[['current canonical',loadBotanicalSizeAuthority(ROOT)],['historical A',historicalRegistry],['qualified scratch B',qualifiedRegistry]];
function jaboticabaContract(registry) {
  const record=registry.records.find(r=>r.botanicalTaxonId==='taxon:plinia-cauliflora');
  assert.ok(record,'Jaboticaba record required');
  // Full pinned record identities prevent permissive third-state fallthrough.
  switch(fingerprint(record)) {
    case '6039ea35931fff9eaed33d0b05745b32af696d37d573bf97a3a26f949b85f407':
      return {runtimeAuthority:'RUNTIME_AUTHORITY_PARTIAL',invalidHeight:true,heightScaleReady:true,heightAuthority:'UNKNOWN',fallbackReason:'INVALID_AUTHORITATIVE_HEIGHT_RANGE',readinessState:'SIZE_AUTHORITY_PARTIAL'};
    case 'adea051a4c82c2adc59f62a00f65de516c3616f0f760caac91624307304f10af':
      return {runtimeAuthority:'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED',invalidHeight:false,heightScaleReady:false,heightAuthority:'ESTIMATED',fallbackReason:'PERSONAL_CONTEXT_REQUIRED',readinessState:'SIZE_AUTHORITY_CONTEXT_REQUIRED'};
    default: assert.fail('UNEXPECTED_JABOTICABA_STATE');
  }
}

function assertSupportedIntegration(registry) {
  const canary = { cases: Object.fromEntries([
    ['mango', 'mango'], ['olive', 'olive'], ['blueGum', 'blue-gum'],
    ['lemon', 'lemon'], ['cypress', 'cypress'], ['breadfruit', 'breadfruit']
  ].map(([key, canonicalSlug]) => [key, resolveGardenSizeAuthority(registry, { canonicalSlug })])) };
  for (const row of Object.values(canary.cases)) {
    assert.equal(row.gardenDesignBlocked, false);
    assert.equal(row.calibrationMandatory, false);
  }
  const before = JSON.stringify(registry);
  resolveGardenSizeAuthority(registry, {
    canonicalSlug: 'mango',
    canaryContext: true,
    ownerPreferredRangePosition: 'LOW',
    userScaleOverride: { kind: 'multiplier', value: 1.2 }
  });
  assert.equal(JSON.stringify(registry), before);
  assert.equal(JSON.stringify(registry).includes('ownerPreferredRangePosition'), false);
  const adapterSrc = fs.readFileSync(ADAPTER, 'utf8');
  assert.equal(adapterSrc.includes('tree-size-evidence-wave-v1-records'), false);
  assert.equal(adapterSrc.includes('evidence-records.json'), false);
  assert.equal(canary.cases.mango.previewScenario, 'LANDSCAPE_MATURE');
  assert.equal(canary.cases.olive.previewScenario, 'LANDSCAPE_MATURE');
  assert.notEqual(canary.cases.olive.heightRangeM.max, canary.cases.mango.heightRangeM.max);
  assert.equal(canary.cases.blueGum.spreadAuthority, 'ESTIMATED');
  assert.equal(canary.cases.lemon.fallbackReason, 'PERSONAL_CONTEXT_REQUIRED');
  assert.equal(canary.cases.cypress.conflictHold, true);
  // The accepted 117-record freeze has PARTIAL breadfruit, unlike the historical canary.
  assert.equal(canary.cases.breadfruit.runtimeAuthorityState, 'RUNTIME_AUTHORITY_PARTIAL');
  assert.equal(canary.cases.breadfruit.usedAuthoritativeMeters, true);
  assert.equal(GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled, true);
  const cedar = resolveGardenSizeAuthority(registry, { canonicalSlug: 'cedar', canaryContext: true });
  assert.equal(cedar.applied, true);
  assert.equal(cedar.runtimeAuthorityState, 'RUNTIME_AUTHORITY_READY');
  const cedarProd = resolveGardenSizeAuthority(registry, { canonicalSlug: 'cedar' });
  assert.equal(cedarProd.applied, true);
}

function registryWithRange(heightM, spreadM = { min: 2, max: 4 }, runtimeAuthority = 'RUNTIME_AUTHORITY_READY') {
  return {
    slugToBotanicalTaxonId: { fixture: 'taxon:fixture' },
    records: [{ botanicalTaxonId: 'taxon:fixture', growthStage: 'mature', runtimeAuthority,
      partialAnchor: 'HEIGHT_ANCHORED_ESTIMATE', HEIGHT_SCALE_READY: true, SPREAD_SCALE_READY: true,
      normalizedRange: { heightM, spreadM } }]
  };
}

test('READY and PARTIAL claims require strict ranges in adapter, readiness and scale wrapper', () => {
  const cases = [null, undefined, {}, { min: null, max: null }, { min: null, max: 5 },
    { min: 5, max: null }, { min: 0, max: 0 }, { min: -1, max: 5 }, { min: 5, max: 1 },
    { min: '5', max: 10 }, { min: 5, max: '10' }, { min: true, max: 10 },
    { min: false, max: 10 }, { min: NaN, max: 10 }, { min: 5, max: Infinity }];
  for (const state of ['RUNTIME_AUTHORITY_READY', 'RUNTIME_AUTHORITY_PARTIAL']) {
    for (const heightM of cases) {
      const registry = registryWithRange(heightM, undefined, state);
      const authority = resolveGardenSizeAuthority(registry, { canonicalSlug: 'fixture' });
      assert.equal(authority.usedAuthoritativeMeters, false);
      assert.equal(authority.heightRangeM, null);
      assert.equal(authority.heightAuthority, 'UNKNOWN');
      assert.equal(authority.previewScenario, null);
      assert.equal(authority.fallbackReason, 'INVALID_AUTHORITATIVE_HEIGHT_RANGE');
      assert.equal(authority.manualOverrideCompatibility, 'ALWAYS');
      const readiness = resolvePlantSizeAuthorityReadiness(registry, { canonicalSlug: 'fixture', growthStage: 'mature' });
      assert.equal(readiness.authoritativeMetersAvailable, false);
      assert.equal(readiness.heightScaleReady, true);
      assert.equal(readiness.explicitEstimateOnly, true);
      assert.equal(readiness.gardenDesignMayUseExplicitEstimate, true);
      assert.ok(readiness.reasonCodes.includes('INVALID_AUTHORITATIVE_HEIGHT_RANGE'));
      // Even a caller forging the adapter flag cannot bypass range validation.
      const scale = scaleFromGardenSizeAuthority({ ...authority, usedAuthoritativeMeters: true, heightRangeM: heightM }, { visualForm: 'tree' });
      assert.equal(scale.code, 'ESTIMATED_HEURISTIC');
      assert.equal(scale.scale.heightRangeM, null);
      assert.equal(scale.scale.botanicalEvidenceClass, 'UNKNOWN');
      assert.equal(scale.scale.scaleMode, 'ESTIMATED');
      assert.equal(scale.gardenDesignBlocked, false);
      assert.ok(scale.scale.imgHeightPct > 0);
    }
    for (const heightM of [{ min: 5, max: 10 }, { min: 5, max: 5 }]) {
      const registry = registryWithRange(heightM, undefined, state);
      const authority = resolveGardenSizeAuthority(registry, { canonicalSlug: 'fixture' });
      assert.equal(authority.usedAuthoritativeMeters, true);
      assert.deepEqual(authority.heightRangeM, heightM);
      assert.equal(resolvePlantSizeAuthorityReadiness(registry, { canonicalSlug: 'fixture' }).authoritativeMetersAvailable, true);
    }
  }
  for (const spreadM of cases) {
    const registry = registryWithRange({ min: 5, max: 10 }, spreadM);
    // undefined means a genuinely missing field, not the fixture's default argument.
    registry.records[0].normalizedRange.spreadM = spreadM;
    const authority = resolveGardenSizeAuthority(registry, { canonicalSlug: 'fixture' });
    assert.equal(authority.usedAuthoritativeMeters, true);
    assert.equal(authority.spreadRangeM, null);
    assert.equal(authority.spreadSourceSupported, false);
    assert.equal(authority.spreadAuthority, 'ESTIMATED');
    const readiness = resolvePlantSizeAuthorityReadiness(registry, { canonicalSlug: 'fixture' });
    assert.equal(readiness.authoritativeMetersAvailable, true);
    assert.equal(readiness.meterAccuracyClaimAllowed, false);
    assert.equal(readiness.spreadScaleReady, true);
    const scale = scaleFromGardenSizeAuthority({ ...authority, spreadRangeM: spreadM });
    assert.equal(scale.spreadSourceSupported, false);
  }
});

function assertRegistrySemantics(registry) {
  const expected=jaboticabaContract(registry);
  const before = JSON.stringify(registry);
  const failures = { readyHeight: [], readySpread: [], partialHeight: [], partialSpread: [] };
  for (const record of registry.records) {
    const heightValid = validateBotanicalRange(record.normalizedRange?.heightM).valid;
    const spreadValid = validateBotanicalRange(record.normalizedRange?.spreadM).valid;
    const ready = record.runtimeAuthority === 'RUNTIME_AUTHORITY_READY';
    const partial = record.runtimeAuthority === 'RUNTIME_AUTHORITY_PARTIAL';
    if (ready && !heightValid) failures.readyHeight.push(record.botanicalTaxonId);
    if (ready && !spreadValid) failures.readySpread.push(record.botanicalTaxonId);
    if (partial && record.HEIGHT_SCALE_READY === true && !heightValid) failures.partialHeight.push(record.botanicalTaxonId);
    if (partial && record.SPREAD_SCALE_READY === true && !spreadValid) failures.partialSpread.push(record.botanicalTaxonId);
    for (const [canonicalSlug, taxon] of Object.entries(registry.slugToBotanicalTaxonId)) {
      if (taxon !== record.botanicalTaxonId) continue;
      const authority = resolveGardenSizeAuthority(registry, { canonicalSlug });
      const readiness = resolvePlantSizeAuthorityReadiness(registry, { canonicalSlug });
      assert.equal(readiness.heightScaleReady, record.HEIGHT_SCALE_READY === true);
      assert.equal(readiness.spreadScaleReady, record.SPREAD_SCALE_READY === true);
      assert.equal(readiness.normalizedRange, record.normalizedRange);
      if (authority.usedAuthoritativeMeters) {
        assert.ok(heightValid);
        assert.deepEqual(authority.heightRangeM, record.normalizedRange.heightM);
      }
      if (ready) {
        assert.equal(authority.usedAuthoritativeMeters, true);
        assert.deepEqual(authority.spreadRangeM, record.normalizedRange.spreadM);
      }
      if (!ready && !partial) {
        assert.equal(authority.usedAuthoritativeMeters, false);
        assert.equal(readiness.authoritativeMetersAvailable, false);
        assert.equal(readiness.reasonCodes.includes('INVALID_AUTHORITATIVE_HEIGHT_RANGE'), false);
      }
    }
  }
  assert.equal(registry.records.length, 117);
  assert.equal(Object.keys(registry.slugToBotanicalTaxonId).length,119);
  assert.deepEqual(failures, { readyHeight: [], readySpread: [], partialHeight: expected.invalidHeight ? ['taxon:plinia-cauliflora'] : [], partialSpread: [] });
  const jaboticaba = resolveGardenSizeAuthority(registry, { canonicalSlug: 'jaboticaba' });
  assert.equal(jaboticaba.usedAuthoritativeMeters, false);
  assert.equal(jaboticaba.heightRangeM, null);
  assert.equal(jaboticaba.runtimeAuthorityState,expected.runtimeAuthority);
  assert.equal(jaboticaba.heightAuthority,expected.heightAuthority);
  assert.equal(jaboticaba.fallbackReason,expected.fallbackReason);
  assert.equal(jaboticaba.spreadRangeM,null);
  assert.equal(jaboticaba.previewScenario,null);
  const readiness=resolvePlantSizeAuthorityReadiness(registry,{canonicalSlug:'jaboticaba'});
  assert.equal(readiness.state,expected.readinessState);
  assert.equal(readiness.heightScaleReady,expected.heightScaleReady);
  assert.equal(readiness.authoritativeMetersAvailable,false);
  assert.equal(readiness.reasonCodes.includes('INVALID_AUTHORITATIVE_HEIGHT_RANGE'),expected.invalidHeight);
  const manual = scaleFromGardenSizeAuthority(jaboticaba, { userScaleOverride: { kind: 'heightM', value: 3 } });
  assert.equal(manual.scale.botanicalEvidenceClass, 'UNKNOWN');
  assert.equal(manual.scale.botanicalHeightM, null);
  assert.ok(manual.scale.imgHeightPct > 0);
  assert.equal(JSON.stringify(registry), before);
}

for(const [label,registry] of registryCases) {
  test(label+': supported ranges, holds and design state remain independent',()=>assertSupportedIntegration(registry));
  test(label+': strict 117-record semantic audit and Jaboticaba state contract',()=>assertRegistrySemantics(registry));
}

test('explicit A/B Jaboticaba fixtures preserve the historical defect and corrected context contract',()=>{
  const a=historicalRegistry.records.find(r=>r.botanicalTaxonId==='taxon:plinia-cauliflora');
  const b=qualifiedRegistry.records.find(r=>r.botanicalTaxonId==='taxon:plinia-cauliflora');
  assert.equal(a.runtimeAuthority,'RUNTIME_AUTHORITY_PARTIAL');assert.equal(a.HEIGHT_SCALE_READY,true);
  assert.deepEqual(a.normalizedRange.heightM,{min:null,max:null});
  assert.equal(jaboticabaContract(historicalRegistry).invalidHeight,true);
  assert.equal(b.runtimeAuthority,'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED');assert.equal(b.HEIGHT_SCALE_READY,false);
  for(const field of ['defaultPreviewScenario','selectedHeightEvidenceRef','selectedSpreadEvidenceRef','selectedSource','normalizedRange','partialAnchor'])assert.equal(b[field],null);
  assert.equal(b.SPREAD_SCALE_READY,false);assert.equal(b.spreadSourceSupported,false);
  assert.equal(b.contextSeparableHeight,true);assert.deepEqual(b.unknownFields,['spread']);
  assert.equal(b.sensitivity.notFinalPersonalGardenSize,true);
  assert.equal(jaboticabaContract(qualifiedRegistry).invalidHeight,false);
});

test('current semantic contract rejects third states and invented universal meters',()=>{
  for(const edit of [r=>r.runtimeAuthority='RUNTIME_AUTHORITY_EVIDENCE_GAP',r=>r.HEIGHT_SCALE_READY=true,
    r=>r.selectedHeightEvidenceRef='unreviewed',...[6.096,9.144,(6.096+9.144)/2].map(value=>r=>{r.normalizedRange={heightM:{min:value,max:value},spreadM:null};})]) {
    const registry=structuredClone(qualifiedRegistry);edit(registry.records.find(r=>r.botanicalTaxonId==='taxon:plinia-cauliflora'));
    assert.throws(()=>assertRegistrySemantics(registry),/UNEXPECTED_JABOTICABA_STATE/);
  }
});

test('historical and scratch coverage never substitutes the current tracked canonical',()=>{
  assert.ok(fs.readFileSync(path.join(ROOT,canonicalPath)).equals(currentCanonicalBefore));
});
