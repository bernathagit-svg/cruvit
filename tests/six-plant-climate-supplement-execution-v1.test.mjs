import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {catalogRowToRuntimePlant} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import {classifyPlantDataReadiness} from '../modules/personal-domain/plant-data-contract-v1.js';
import {applyHardinessZoneToColdTraits} from '../modules/personal-domain/hardiness-zone-to-cold-traits-v1.js';
import {evaluateFullPlantOnboarding} from '../modules/catalog/full-plant-onboarding-gate-v1.js';
import {evaluateFullCruvitPlantApproval} from '../modules/catalog/full-cruvit-plant-approval-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = 'data/garden-design/plant-intake-e2e-stress-tests/six-plant-climate-supplement-2026-10-07-v1/';
const proposalPath = 'data/garden-design/plant-intake-e2e-stress-tests/six-plant-evidence-followup-2026-10-07-v1/proposal.json';
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const snapshot = read(folder + 'catalog-before.json');
const patches = read(folder + 'catalog-patches.json');
const preflight = read(folder + 'preflight.json');
const approval = read(folder + 'approval-and-scope.json');
const proposal = read(proposalPath);
const clone = value => JSON.parse(JSON.stringify(value));
const expectedSlugs = ['date-palm', 'mango', 'monstera'];
const scientificNames = {'date-palm':'Phoenix dactylifera', mango:'Mangifera indica', monstera:'Monstera deliciosa'};
const expectedMd5 = {
  mango:'decc962b92f64986adc48ffd02ea9954',
  'date-palm':'3a944ab33e4615fa5f8d11a84368526c',
  monstera:'c932d4184241f5afee54b88561b30bdc'
};
const mangoSourceIds = {
  cold:'uf-ifas-mango-st404-20261007',
  heat:'uf-ifas-fruit-hs1499-20261007',
  biology:'uf-ifas-mango-mg216-20261007'
};
const chillSourceIds = {
  'date-palm':['uf-ifas-phoenix-dactylifera'],
  monstera:['uf-ifas-monstera-fruit','ncsu-monstera-deliciosa']
};
const biologicalFields = ['reproductive.flowerSexExpression','reproductive.pollinationAgents'];
const before = slug => snapshot.target_rows.find(item => item.slug === slug).row;
const after = slug => patches.find(item => item.slug === slug).after;
const classify = row => classifyPlantDataReadiness(catalogRowToRuntimePlant(row), {requireReproductiveBiologyForFruiting:true});

// Remove only the allowed climate paths; compare everything else, including row metadata.
function unrelatedRow(row) {
  const result = clone(row), ct = result.climate_traits;
  delete result.provenance; // Source changes are checked independently, source by source.
  if (row.slug === 'mango') {
    delete ct.heatTolerance;
    delete ct.reproductiveBiology;
    for (const key of ['coldTolerance','heatTolerance',...biologicalFields]) {
      delete ct.traitEvidenceClasses[key];
      delete ct.traitProvenance[key];
    }
    ct.plantKnowledge.sources = ct.plantKnowledge.sources.filter(source => source.sourceId !== mangoSourceIds.heat);
  } else {
    delete ct.needsWinterChill;
    delete ct.traitEvidenceClasses.needsWinterChill;
    delete ct.traitProvenance.needsWinterChill;
  }
  return result;
}

function unaffectedSourceClaims(source, fields) {
  const result = clone(source);
  result.supportsFields = (result.supportsFields || []).filter(field => !fields.includes(field));
  for (const key of ['assertedClaims','unknownClaims']) {
    result[key] = (result[key] || []).filter(claim => !fields.includes(claim.field));
  }
  return result;
}

test('execution is bound to the exact immutable reviewed proposal and exactly three fresh target rows', () => {
  assert.equal(approval.proposalCommit, '278ab87150fe60377c3a3e56f82dfdf0182c6f67');
  assert.equal(approval.proposalPath, proposalPath);
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, proposalPath))).digest('hex');
  assert.equal(actualHash, '76ccbadccb92fafed23e14f4b12c9920b97033435a739cb9786a3fb74181fd52');
  assert.equal(approval.proposalSha256, actualHash);
  assert.equal(proposal.status, 'DRAFT_NOT_APPLIED');
  assert.equal(proposal.executionAuthorized, false);
  assert.equal(proposal.catalogWritesAllowed, false);
  assert.equal(approval.executionAuthorized, true);
  assert.equal(approval.catalogWritesAllowed, true);
  assert.deepEqual([...approval.catalogAllowedSlugs].sort(), expectedSlugs);
  assert.deepEqual(patches.map(patch => patch.slug).sort(), expectedSlugs);
  assert.deepEqual(snapshot.target_rows.map(item => item.slug).sort(), expectedSlugs);
  for (const patch of patches) {
    assert.equal(patch.expectedRowMd5, expectedMd5[patch.slug]);
    assert.equal(snapshot.target_rows.find(item => item.slug === patch.slug).row_md5, patch.expectedRowMd5);
    assert.equal(patch.after.scientific_name, scientificNames[patch.slug]);
  }
  for (const key of ['paidAiAllowed','imageGenerationAllowed','productionDeployAllowed','productionR2WritesAllowed','visualRegistryWritesAllowed']) {
    assert.equal(approval[key], false, key);
  }
  assert.equal(preflight.mode, 'OFFLINE_PREPARATION_ONLY');
  assert.equal(preflight.catalogWritesExecuted, 0);
});

test('saved patches preserve every row field outside the exact climate and provenance scope', () => {
  for (const slug of expectedSlugs) {
    assert.deepEqual(unrelatedRow(after(slug)), unrelatedRow(before(slug)), slug);
    const original = before(slug), revised = after(slug);
    const changedTopLevel = [...new Set([...Object.keys(original),...Object.keys(revised)])]
      .filter(key => !isDeepStrictEqual(original[key], revised[key])).sort();
    assert.deepEqual(changedTopLevel, ['climate_traits','provenance'], slug);
    assert.deepEqual(revised.media, original.media);
    assert.equal(revised.media_status, original.media_status);
    assert.deepEqual(revised.climate_traits.designMetadata, original.climate_traits.designMetadata);
  }
});

test('Mango cold evidence uses the approved zone transform without changing cold or frost values', () => {
  const oldTraits = before('mango').climate_traits, ct = after('mango').climate_traits;
  const evidence = ct.traitProvenance.coldTolerance;
  const exactClaim = {claimType:'usda_hardiness_zone_band',hardinessZoneSystem:'USDA',hardinessZoneMin:10.5,hardinessZoneMax:11,rawValue:'10B through 11'};
  assert.equal(ct.coldTolerance, 'very_low');
  assert.equal(ct.coldTolerance, oldTraits.coldTolerance);
  assert.deepEqual(evidence.sourceClaim, exactClaim);
  assert.deepEqual(evidence.sourceIds, [mangoSourceIds.cold]);
  assert.equal(evidence.sourceUrl, 'https://ask.ifas.ufl.edu/publication/ST404');
  assert.equal(evidence.transformId, 'hardiness-zone-to-cold-traits-v1');
  assert.equal(evidence.transformVersion, '1.1.0');
  assert.equal(evidence.transformRef, 'hardiness-zone-to-cold-traits-v1@1.1.0');
  assert.equal(evidence.evidenceLineage, 'DERIVED_FROM_SOURCE_CLAIM_VIA_APPROVED_TRANSFORM');
  assert.equal(evidence.evidenceClass, 'SOURCE_SUPPORTED');
  assert.equal(ct.traitEvidenceClasses.coldTolerance, 'SOURCE_SUPPORTED');
  assert.match(evidence.shortExcerpt, /10B through 11/);
  assert.notEqual(evidence.shortExcerpt, oldTraits.traitProvenance.coldTolerance.shortExcerpt);
  const transformed = applyHardinessZoneToColdTraits(exactClaim);
  assert.equal(transformed.ok, true);
  assert.deepEqual(transformed.outputs.map(output => [output.targetField,output.value]), [['coldTolerance','very_low']]);
  assert.equal(transformed.frostSensitivity.authorized, false);
  assert.equal(ct.frostSensitivity, oldTraits.frostSensitivity);
  assert.equal(ct.traitEvidenceClasses.frostSensitivity, 'HEURISTIC_ASSERTION');
  assert.deepEqual(ct.traitProvenance.frostSensitivity, oldTraits.traitProvenance.frostSensitivity);
});

test('Mango heat stays an explicitly approved heuristic and preserves the distinct source temperatures', () => {
  const ct = after('mango').climate_traits, evidence = ct.traitProvenance.heatTolerance;
  assert.equal(ct.heatTolerance, 'medium');
  assert.equal(ct.traitEvidenceClasses.heatTolerance, 'HEURISTIC_ASSERTION');
  assert.equal(evidence.evidenceClass, 'HEURISTIC_ASSERTION');
  assert.equal(evidence.status, 'asserted');
  assert.equal(evidence.isEstimate, true);
  assert.equal(evidence.ownerApprovalRef, approval.id);
  assert.deepEqual(evidence.sourceIds, [mangoSourceIds.heat]);
  assert.equal(evidence.sourceUrl, 'https://ask.ifas.ufl.edu/publication/HS1499');
  assert.equal(evidence.sourceLocator, 'Table 10, Mango');
  assert.deepEqual(evidence.sourceHeatDamageC, {operator:'>',value:40});
  assert.equal(evidence.rawHeatDamageF, '>104');
  assert.equal(evidence.rawOptimumF, '75-86');
  assert.match(evidence.interpretation, /NOT the source's literal ordinal/);
  assert.match(evidence.interpretation, /NOT a universal damage-free survival boundary/);
  const activeClaim = after('mango').provenance.find(source => source.sourceId === mangoSourceIds.heat)
    .assertedClaims.find(claim => claim.field === 'heatTolerance');
  assert.equal(activeClaim.evidenceClass, 'HEURISTIC_ASSERTION');
});

test('Mango preserves UNKNOWN and outcome context while adding only the two approved biological facts', () => {
  const oldTraits = before('mango').climate_traits, ct = after('mango').climate_traits;
  for (const key of ['humidityTolerance','needsWinterChill']) {
    assert.equal(Object.hasOwn(ct, key), false);
    assert.equal(ct.traitEvidenceClasses[key], 'UNKNOWN');
    assert.deepEqual(ct.traitProvenance[key], oldTraits.traitProvenance[key]);
    assert.equal(ct.traitProvenance[key].status, 'unknown');
  }
  assert.deepEqual(ct.reproductiveBiology, {flowerSexExpression:'male_and_bisexual_flowers',pollinationAgents:['insects']});
  for (const key of biologicalFields) {
    assert.equal(ct.traitEvidenceClasses[key], 'SOURCE_SUPPORTED');
    assert.equal(ct.traitProvenance[key].evidenceClass, 'SOURCE_SUPPORTED');
    assert.deepEqual(ct.traitProvenance[key].sourceIds, [mangoSourceIds.biology]);
    assert.equal(ct.traitProvenance[key].selfFertilityNotInferred, true);
  }
  assert.deepEqual(ct.reproductiveClimate, oldTraits.reproductiveClimate);
  assert.equal(ct.reproductiveClimate.fruiting.evidenceState, 'CONTEXT_DEPENDENT');
  assert.deepEqual(ct.reproductiveClimate.fruiting.contextKeys, ['cultivar','local_climate','bloom_weather']);
  assert.equal(Object.hasOwn(ct.reproductiveClimate.fruiting, 'requiresDrySeason'), false);
  assert.deepEqual(ct.plantKnowledge.importantNotes, oldTraits.plantKnowledge.importantNotes);
});

test('actual Date Palm and Monstera rows pass identity-aware fruiting onboarding with null reviewed UNKNOWN', () => {
  for (const slug of ['date-palm','monstera']) {
    const row = after(slug), ct = row.climate_traits, evidence = ct.traitProvenance.needsWinterChill;
    const expected = {canonicalSlug:slug,scientific:scientificNames[slug],phenology:'fruiting'};
    const previous = evaluateFullPlantOnboarding(before(slug), expected);
    assert.equal(previous.climate.traitStates.needsWinterChill, 'MISSING');
    assert.equal(row.scientific_name, scientificNames[slug]);
    assert.equal(Object.hasOwn(ct, 'needsWinterChill'), true);
    assert.equal(ct.needsWinterChill, null);
    assert.notEqual(typeof ct.needsWinterChill, 'boolean');
    assert.equal(ct.traitEvidenceClasses.needsWinterChill, 'UNKNOWN');
    assert.equal(evidence.value, null);
    assert.equal(evidence.status, 'unknown');
    assert.equal(evidence.evidenceClass, 'UNKNOWN');
    assert.equal(evidence.reviewState, 'REVIEWED_UNQUANTIFIED');
    assert.equal(evidence.booleanNotInferred, true);
    assert.deepEqual(evidence.sourceIds, chillSourceIds[slug]);
    for (const reviewedSource of evidence.sourceReviews) {
      assert.ok(chillSourceIds[slug].includes(reviewedSource.sourceId));
      assert.equal(reviewedSource.url, proposal.sourceReview[reviewedSource.sourceId].url);
      assert.equal(reviewedSource.note, proposal.sourceReview[reviewedSource.sourceId].winterChillReview);
    }
    const result = evaluateFullPlantOnboarding(row, expected);
    assert.equal(result.ready, true, slug);
    assert.equal(result.gates.identity, 'PASS');
    assert.equal(result.outcome.code, 'FRUITING_REQUIREMENTS_READY');
    assert.equal(result.climate.traitStates.needsWinterChill, 'EXPLICIT_UNKNOWN');
    assert.ok(result.climate.explicitUnknownCoreTraits.includes('needsWinterChill'));
    const wrongIdentity = evaluateFullPlantOnboarding(row, {...expected,scientific:'Mangifera indica'});
    assert.equal(wrongIdentity.ready, false);
    assert.equal(wrongIdentity.gates.identity, 'FAIL');
  }
});

test('actual readiness improves without using gate defaults or disguising remaining uncertainty', () => {
  assert.equal(classify(before('mango')).readinessShort, 'C');
  for (const slug of expectedSlugs) {
    const result = classify(after(slug));
    assert.equal(result.readinessShort, 'A', slug);
    assert.equal(result.gate, 'PASS', slug);
    if (slug !== 'mango') assert.equal(classify(before(slug)).readinessShort, 'A', slug);
  }
  assert.ok(classify(after('mango')).reasons.includes('HUMIDITY_UNKNOWN'));
  assert.equal(classify(after('mango')).reasons.includes('REPRODUCTIVE_CONTEXT_MISSING'), false);
  const withoutHeat = clone(after('mango'));
  delete withoutHeat.climate_traits.heatTolerance;
  assert.equal(classify(withoutHeat).readinessShort, 'C');
  const unsupportedCold = clone(after('mango'));
  unsupportedCold.climate_traits.traitEvidenceClasses.coldTolerance = 'HEURISTIC_ASSERTION';
  assert.notEqual(classify(unsupportedCold).readinessShort, 'A');
});

test('active source claims are consistent and every unrelated source and claim remains unchanged', () => {
  for (const slug of expectedSlugs) {
    const original = before(slug), revised = after(slug);
    assert.equal(new Set(revised.provenance.map(source => source.sourceId)).size, revised.provenance.length);
    for (const oldSource of original.provenance) {
      const newSource = revised.provenance.find(source => source.sourceId === oldSource.sourceId);
      assert.ok(newSource, 'Original source removed: ' + oldSource.sourceId);
      const fields = slug === 'mango'
        ? (oldSource.sourceId === mangoSourceIds.biology ? ['coldTolerance','heatTolerance',...biologicalFields]
          : oldSource.sourceId === mangoSourceIds.cold ? ['coldTolerance'] : [])
        : (chillSourceIds[slug].includes(oldSource.sourceId) ? ['needsWinterChill'] : []);
      assert.deepEqual(unaffectedSourceClaims(newSource, fields), unaffectedSourceClaims(oldSource, fields), slug + ':' + oldSource.sourceId);
    }
    const addedIds = revised.provenance.filter(source => !original.provenance.some(oldSource => oldSource.sourceId === source.sourceId)).map(source => source.sourceId);
    assert.deepEqual(addedIds, slug === 'mango' ? [mangoSourceIds.heat] : []);
    const originalKnowledge = original.climate_traits.plantKnowledge.sources;
    const revisedKnowledge = revised.climate_traits.plantKnowledge.sources;
    assert.deepEqual(revisedKnowledge.filter(source => source.sourceId !== mangoSourceIds.heat), originalKnowledge);
    const fields = slug === 'mango' ? ['coldTolerance','heatTolerance',...biologicalFields] : ['needsWinterChill'];
    for (const field of fields) {
      const trait = revised.climate_traits.traitProvenance[field];
      for (const sourceId of trait.sourceIds) {
        const source = revised.provenance.find(item => item.sourceId === sourceId);
        assert.ok(source, 'Unresolved botanical source: ' + sourceId);
        assert.ok(revisedKnowledge.some(item => item.sourceId === sourceId), 'Unresolved knowledge source: ' + sourceId);
        const collection = trait.status === 'unknown' ? source.unknownClaims : source.assertedClaims;
        const matches = collection.filter(claim => claim.field === field);
        assert.equal(matches.length, 1, slug + ':' + sourceId + ':' + field);
        assert.equal(matches[0].status, trait.status);
        assert.equal(matches[0].evidenceClass, trait.evidenceClass);
        assert.equal(matches[0].claimId, trait.claimId);
        if (trait.status === 'unknown') {
          assert.equal(source.supportsFields.includes(field), false);
          assert.equal(source.assertedClaims.some(claim => claim.field === field), false);
        } else {
          assert.ok(source.supportsFields.includes(field));
          assert.equal(source.unknownClaims.some(claim => claim.field === field), false);
        }
      }
    }
  }
  const mango = after('mango');
  assert.equal(mango.provenance.some(source => source.unknownClaims.some(claim => claim.field === 'heatTolerance')), false);
  const coldSources = mango.provenance.filter(source => source.assertedClaims.some(claim => claim.field === 'coldTolerance'));
  assert.deepEqual(coldSources.map(source => source.sourceId), [mangoSourceIds.cold]);
  const heatSources = mango.provenance.filter(source => source.assertedClaims.some(claim => claim.field === 'heatTolerance'));
  assert.deepEqual(heatSources.map(source => source.sourceId), [mangoSourceIds.heat]);
  const newHeat = mango.provenance.find(source => source.sourceId === mangoSourceIds.heat);
  assert.equal(newHeat.url, 'https://ask.ifas.ufl.edu/publication/HS1499');
  assert.deepEqual(newHeat.supportsFields, ['heatTolerance']);
  assert.equal(newHeat.plantIdentity.acceptedScientificName, 'Mangifera indica');
  assert.equal(newHeat.unknownClaims.length, 0);
  assert.equal(newHeat.assertedClaims.length, 1);
});

test('control results and protected files stay unchanged; unresolved flowering is never all-states complete', () => {
  assert.deepEqual(snapshot.control_rows.map(item => item.slug).sort(), ['bigleaf-hydrangea','fig','lettuce']);
  for (const control of snapshot.control_rows) {
    assert.equal(patches.some(patch => patch.slug === control.slug), false);
    assert.deepEqual(preflight.after.find(item => item.slug === control.slug), preflight.before.find(item => item.slug === control.slug));
  }
  assert.equal(preflight.otherRowsCount, snapshot.other_rows_count);
  assert.equal(snapshot.other_rows_count, 133);
  assert.equal(preflight.otherRowsMd5, snapshot.other_rows_md5);
  assert.match(snapshot.other_rows_md5, /^[a-f0-9]{32}$/);
  for (const [relative, expectedHash] of Object.entries(preflight.protectedHashes)) {
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
    assert.equal(actualHash, expectedHash, relative);
  }
  const identityRegistry = read('data/plant-identity.registry.json');
  const designAssetRegistry = read('modules/garden-design/assets/plants/design-asset-registry-v1.json');
  const sizeAuthorityRegistry = read('data/catalog/botanical-size-authority-v1.json');
  const mediaCoverage = read('data/catalog-media/active-canonical-image-coverage-v1.json');
  for (const slug of expectedSlugs) {
    const result = evaluateFullCruvitPlantApproval({catalogRow:after(slug),identityRegistry,designAssetRegistry,sizeAuthorityRegistry,
      catalogMediaCoverageRecord:mediaCoverage.records.find(record => record.slug === slug)});
    const states = result.modules.gardenDesign.unknownStates;
    assert.ok(states.includes('flowering'), slug);
    assert.equal(result.approved && states.length === 0, false, slug);
    const recorded = preflight.after.find(item => item.slug === slug);
    assert.deepEqual(recorded.unknownVisualStates, states);
    assert.equal(recorded.allStatesComplete, false);
    assert.match(recorded.evidenceScope, /not a location suitability assessment or deployed size metadata/);
  }
});
