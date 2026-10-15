import {prepareAddPlantIntent} from './add-plant-contract.js';
import {createAtomicAddPlantCommand} from './add-plant-write-repository.js';

// Historical Preview inputs. Only the compatibility wrapper below supplies them.
export const SAVE_KEY='identifier:core-v1-commit5-20261008-monstera-01';
export const GARDEN='a2b4080d-3858-4f71-b5ac-23847aa17e1d';
export const OWNER='f9df38ad-7f91-41cf-b7ce-ee87a692be86';
export const FIXTURE=Object.freeze({name:'Monstera',scientific:'Monstera deliciosa',profileSlug:'monstera'});

const text = value => typeof value === 'string' && value.length > 0
  && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);

// Shared by the controller and its readback dependency; never resolves/rematches a plant.
export function assertIdentifierSaveBinding(binding) {
  if (!text(binding?.gardenId) || !text(binding.ownerId) || !text(binding.clientInstanceId)
      || !text(binding.fixture?.profileSlug) || !text(binding.fixture.scientific)
      || !text(binding.fixture.name)) throw Error('Explicit canonical save context required');
}

function assertPlant(plant, binding, plantId = plant?.id) {
  if (!text(plant?.id) || plant.id !== plantId || plant.user_id !== binding.ownerId
      || plant.garden_profile_id !== binding.gardenId || plant.client_instance_id !== binding.clientInstanceId
      || plant.profile_slug !== binding.fixture.profileSlug || plant.scientific !== binding.fixture.scientific) {
    throw Error('Authoritative response identity mismatch');
  }
}

function assertHistory(history, binding, plantId, historyId = history?.id, readback = false) {
  if (!text(history?.id) || history.id !== historyId || history.garden_plant_id !== plantId
      || history.event_type !== 'plant_added' || history.source_module !== 'plant_identifier'
      || (Object.hasOwn(history, 'user_id') && history.user_id !== binding.ownerId)
      || (Object.hasOwn(history, 'garden_profile_id') && history.garden_profile_id !== binding.gardenId)
      || (readback && (history.user_id !== binding.ownerId || history.garden_profile_id !== binding.gardenId
        || history.payload?.client_instance_id !== binding.clientInstanceId))) {
    throw Error('Authoritative History identity mismatch');
  }
}

// One readback validator, used both by the query implementation and before controller success.
export function assertIdentifierSaveReadback(readback, binding, {plantId, historyId}) {
  if (!readback || readback.gardenId !== binding.gardenId || readback.plantKeyCount !== 1
      || readback.plantAddedHistoryCount !== 1 || !Array.isArray(readback.allPlants)
      || readback.totalGardenPlants !== readback.allPlants.length) throw Error('Incomplete authoritative readback');
  assertPlant(readback.plant, binding, plantId);
  assertHistory(readback.history, binding, plantId, historyId, true);
  if (readback.allPlants.some(plant => plant.garden_profile_id !== binding.gardenId || plant.user_id !== binding.ownerId)) {
    throw Error('Authoritative garden readback identity mismatch');
  }
  const exact = readback.allPlants.filter(plant => plant.client_instance_id === binding.clientInstanceId);
  if (exact.length !== 1) throw Error('Authoritative Plant readback cardinality mismatch');
  assertPlant(exact[0], binding, plantId);
}

// The same execution/validation/readback path serves generic callers and the Preview wrapper.
function createSaveController({context, domain, stateStore, record = () => {}}, previewPolicy = null) {
  if (!domain || typeof domain.verify !== 'function' || typeof domain.hydrate !== 'function'
      || typeof domain.getSupabaseClient !== 'function' || typeof domain.metrics !== 'function'
      || typeof domain.delta !== 'function' || typeof stateStore?.read !== 'function'
      || typeof stateStore.write !== 'function') throw Error('Explicit authenticated save dependencies required');
  const binding = Object.freeze({gardenId: context?.gardenId, ownerId: context?.ownerId,
    clientInstanceId: context?.clientInstanceId, fixture: Object.freeze({name: context?.displayName,
      profileSlug: context?.canonicalSlug, scientific: context?.scientificName})});
  assertIdentifierSaveBinding(binding);
  const intent = prepareAddPlantIntent({mode: 'scan', gardenProfileId: binding.gardenId,
    clientInstanceId: binding.clientInstanceId, displayName: binding.fixture.name, identityConfirmed: true,
    canonicalSlug: binding.fixture.profileSlug, scientificName: binding.fixture.scientific, gardenAreaId: null});
  const command = createAtomicAddPlantCommand(domain.getSupabaseClient());
  const intentIdentity = JSON.stringify([binding.gardenId, binding.ownerId, binding.clientInstanceId,
    binding.fixture.profileSlug, binding.fixture.scientific]);
  let inFlight = null;
  function readState() {
    const prior = stateStore.read();
    if (!prior || !Number.isSafeInteger(prior.attempts) || prior.attempts < 0) throw Error('Invalid save attempt state');
    if (prior.intentIdentity != null && prior.intentIdentity !== intentIdentity) throw Error('Conflicting intent identity');
    // Only the fixed historical caller can recognize old attempt records without a binding.
    if (prior.attempts > 0 && prior.intentIdentity == null && !previewPolicy) throw Error('Missing intent identity');
    previewPolicy?.beforeAttempt(prior);
    return prior;
  }
  async function execute() {
    const before = domain.metrics();
    readState();
    await domain.verify(binding);
    const prior = readState(), attempt = prior.attempts + 1;
    stateStore.write({...prior, intentIdentity, attempts: attempt});
    let result;
    try { result = await command.execute(intent); }
    catch (error) {
      record({kind: 'RPC_UNCONFIRMED', attempt, clientInstanceId: binding.clientInstanceId,
        error: error.code ?? 'RPC_FAILED', counts: domain.delta(before)});
      throw error;
    }
    const plant = result.plant, history = result.history;
    assertPlant(plant, binding);
    assertHistory(history, binding, plant.id);
    if (result.created && (plant.status !== 'unassessed' || plant.mark !== 'unknown')) throw Error('New plant health inferred');
    if (prior.plantId && prior.plantId !== plant.id) throw Error('Retry returned different Plant identity');
    if (prior.historyId && prior.historyId !== history.id) throw Error('Retry returned different History identity');
    const receipt = {kind: attempt === 1 ? 'first-save' : 'retry', attempt,
      clientInstanceId: binding.clientInstanceId, created: result.created, historyCreated: result.historyCreated,
      plant, history, at: new Date().toISOString(), counts: domain.delta(before), hydration: 'PENDING'};
    stateStore.write({attempts: attempt, intentIdentity, plantId: plant.id, historyId: history.id});
    record(structuredClone(receipt));
    const expected = Object.freeze({...binding, plantId: plant.id, historyId: history.id});
    const readback = await domain.hydrate(expected);
    assertIdentifierSaveReadback(readback, binding, expected);
    receipt.readback = readback;
    receipt.counts = domain.delta(before);
    if (receipt.counts.rpcCalls !== 1 || receipt.counts.supabaseWrites !== 1) throw Error('Save must use exactly one RPC');
    receipt.hydration = 'VERIFIED';
    record(structuredClone(receipt));
    previewPolicy?.afterReceipt(receipt);
    return Object.freeze(receipt);
  }
  return Object.freeze({save() {
    if (inFlight) return inFlight;
    inFlight = execute().finally(() => { inFlight = null; });
    return inFlight;
  }, intent});
}

export function createCanonicalIdentifierSaveController(options = {}) {
  return createSaveController(options);
}

// Existing imports/boot stay intact: Preview is a fixture-specific caller, not another writer.
export function createIdentifierSaveController({domain, stateStore, record} = {}) {
  return createSaveController({domain, stateStore, record, context: {
    gardenId: GARDEN, ownerId: OWNER, clientInstanceId: SAVE_KEY,
    canonicalSlug: FIXTURE.profileSlug, scientificName: FIXTURE.scientific, displayName: FIXTURE.name
  }}, {
    beforeAttempt(prior) {
      if (prior.attempts >= 2) throw Error('Bounded Commit 5 save and retry already attempted; stop for Supervisor.');
    },
    afterReceipt(receipt) {
      if (receipt.attempt === 1 && (!receipt.created || !receipt.historyCreated)) throw Error('Expected first create; row already existed. Receipt retained for review.');
      if (receipt.attempt === 2 && (receipt.created || receipt.historyCreated)) throw Error('Retry unexpectedly created data');
    }
  });
}
