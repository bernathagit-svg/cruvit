/**
 * Garden Media V1 — minimal My Garden plant photo UI.
 * Add / show cover / history / set cover / delete. No gallery redesign.
 */
import {
  createGardenMediaForPlant,
  listGardenMediaForPlant,
  getGardenMediaSignedUrl,
  deleteGardenMediaAsset,
  setPlantCoverMedia,
  resolveCoverSignedUrlForPlant,
  gardenMediaUserErrorMessage,
  clearGardenMediaSignedUrlCache
} from './garden-media-v1-runtime.js';

const FILE_INPUT_ID = 'gardenMediaPlantPhotoInput';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

function pd() {
  return window.cruvitPersonalDomainV0 || null;
}

function requireAuthContext() {
  const api = pd();
  if (!api || typeof api.isServerPlantsAuthoritative !== 'function' || !api.isServerPlantsAuthoritative()) {
    throw Object.assign(new Error('sign_in_required_for_media'), { code: 'AUTH_REQUIRED' });
  }
  const session = api.getSession?.();
  const userId = session?.user?.id;
  const gardenProfileId = api.getActiveGardenId?.();
  const supabase = api.getSupabaseClient?.();
  if (!userId || !gardenProfileId || !supabase) {
    throw Object.assign(new Error('sign_in_required_for_media'), { code: 'AUTH_REQUIRED' });
  }
  return { api, userId, gardenProfileId, supabase, session };
}

function getPlantByIndex(index) {
  const plants = window.data?.plants;
  if (!Array.isArray(plants) || index < 0 || index >= plants.length) return null;
  return plants[index];
}

function ensureFileInput() {
  let el = document.getElementById(FILE_INPUT_ID);
  if (el) return el;
  el = document.createElement('input');
  el.type = 'file';
  el.id = FILE_INPUT_ID;
  el.accept = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
  el.style.display = 'none';
  el.addEventListener('change', () => {
    const idx = Number(el.dataset.plantIndex);
    const file = el.files && el.files[0];
    el.value = '';
    if (!file || !Number.isFinite(idx)) return;
    uploadPhotoForPlantIndex(idx, file).catch((err) => {
      alert(gardenMediaUserErrorMessage(err));
      console.warn('[GardenMedia]', err);
    });
  });
  document.body.appendChild(el);
  return el;
}

export async function hydratePlantCoverUrls(plants = []) {
  let ctx;
  try {
    ctx = requireAuthContext();
  } catch {
    return;
  }
  const list = Array.isArray(plants) ? plants : [];
  await Promise.all(
    list.map(async (p) => {
      if (!p?.coverMediaId) {
        p.coverSignedUrl = '';
        return;
      }
      try {
        p.coverSignedUrl = await resolveCoverSignedUrlForPlant({
          supabase: ctx.supabase,
          coverMediaId: p.coverMediaId
        });
      } catch {
        p.coverSignedUrl = '';
      }
    })
  );
}

export function renderPlantMediaSectionHtml(plant, plantIndex) {
  const coverUrl = String(plant?.coverSignedUrl || '').trim();
  const coverId = plant?.coverMediaId || '';
  const hasServer = !!(plant?.serverId && pd()?.isServerPlantsAuthoritative?.());

  if (!hasServer) {
    return `<div class="gmedia-panel" data-gmedia-plant="${escapeAttr(String(plantIndex))}">
      <div class="gmedia-head"><b>Plant photos</b></div>
      <p class="gmedia-note">Sign in and sync this garden to add durable plant photos.</p>
    </div>`;
  }

  const coverBlock = coverUrl
    ? `<div class="gmedia-cover" style="background-image:url('${escapeAttr(coverUrl)}')"></div>`
    : `<div class="gmedia-cover gmedia-cover-empty">No plant photo yet</div>`;

  return `<div class="gmedia-panel" data-gmedia-plant="${escapeAttr(String(plantIndex))}" data-cover-id="${escapeAttr(coverId)}">
    <div class="gmedia-head"><b>Plant photos</b>
      <span class="gmedia-lede">Private to your garden · JPEG / PNG / WebP · max 8 MB</span>
    </div>
    ${coverBlock}
    <div class="gmedia-actions">
      <button type="button" class="btn main" data-gmedia-add="${escapeAttr(String(plantIndex))}">Add photo</button>
      <button type="button" class="btn light" data-gmedia-history="${escapeAttr(String(plantIndex))}">Photo history</button>
    </div>
    <div class="gmedia-history" id="gmediaHistory-${escapeAttr(String(plantIndex))}" hidden></div>
    <p class="gmedia-status" id="gmediaStatus-${escapeAttr(String(plantIndex))}" hidden></p>
  </div>`;
}

function setStatus(plantIndex, text, isError = false) {
  const el = document.getElementById(`gmediaStatus-${plantIndex}`);
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('gmedia-error', isError);
}

export function openAddPhotoPicker(plantIndex) {
  const plant = getPlantByIndex(plantIndex);
  if (!plant) return;
  try {
    requireAuthContext();
  } catch {
    alert('Sign in to add a durable plant photo.');
    return;
  }
  if (!plant.serverId) {
    alert('This plant is not synced to the server yet. Save/sync the garden first.');
    return;
  }
  const input = ensureFileInput();
  input.dataset.plantIndex = String(plantIndex);
  input.click();
}

export async function uploadPhotoForPlantIndex(plantIndex, file, options = {}) {
  const plant = getPlantByIndex(plantIndex);
  if (!plant?.serverId) throw new Error('plant_not_synced');
  const ctx = requireAuthContext();
  setStatus(plantIndex, 'Uploading photo…');
  const result = await createGardenMediaForPlant({
    supabase: ctx.supabase,
    userId: ctx.userId,
    gardenProfileId: ctx.gardenProfileId,
    gardenPlantId: plant.serverId,
    gardenAreaId: plant.gardenAreaId || null,
    file,
    setAsCover: options.setAsCover !== false,
    sourceModule: 'my_garden',
    purpose: 'plant_profile'
  });

  plant.coverMediaId = result.media.id;
  try {
    plant.coverSignedUrl = (
      await getGardenMediaSignedUrl({
        supabase: ctx.supabase,
        storagePath: result.storagePath,
        mediaId: result.media.id
      })
    ).signedUrl;
  } catch {
    plant.coverSignedUrl = '';
  }

  try {
    window.data?.events?.unshift?.(['Today', 'Plant photo added', plant.name]);
    if (typeof window.service?.save === 'function' && window.data) window.service.save(window.data);
    if (typeof window.render === 'function') window.render();
    if (typeof window.showPlantPanel === 'function') window.showPlantPanel(plantIndex, 'guide');
  } catch (_) {}

  setStatus(plantIndex, 'Photo saved.');
  return result;
}

export async function showPhotoHistory(plantIndex) {
  const plant = getPlantByIndex(plantIndex);
  const host = document.getElementById(`gmediaHistory-${plantIndex}`);
  if (!plant?.serverId || !host) return;
  const ctx = requireAuthContext();
  setStatus(plantIndex, 'Loading history…');
  const rows = await listGardenMediaForPlant({
    supabase: ctx.supabase,
    gardenProfileId: ctx.gardenProfileId,
    gardenPlantId: plant.serverId
  });
  setStatus(plantIndex, '');

  if (!rows.length) {
    host.hidden = false;
    host.innerHTML = '<p class="gmedia-note">No photos yet.</p>';
    return;
  }

  const items = [];
  for (const row of rows) {
    let url = '';
    try {
      url = (
        await getGardenMediaSignedUrl({
          supabase: ctx.supabase,
          storagePath: row.storage_path,
          mediaId: row.id
        })
      ).signedUrl;
    } catch {
      url = '';
    }
    const isCover = String(plant.coverMediaId || '') === String(row.id);
    items.push(`<li class="gmedia-hist-item" data-media-id="${escapeAttr(row.id)}">
      <div class="gmedia-hist-thumb"${url ? ` style="background-image:url('${escapeAttr(url)}')"` : ''}></div>
      <div class="gmedia-hist-meta">
        <small>${escapeHtml(new Date(row.created_at).toLocaleString())}${isCover ? ' · current' : ''}</small>
        <div class="gmedia-hist-actions">
          ${isCover ? '' : `<button type="button" data-gmedia-cover="${escapeAttr(row.id)}" data-gmedia-plant="${escapeAttr(String(plantIndex))}">Use as cover</button>`}
          <button type="button" data-gmedia-delete="${escapeAttr(row.id)}" data-gmedia-plant="${escapeAttr(String(plantIndex))}">Delete</button>
        </div>
      </div>
    </li>`);
  }
  host.hidden = false;
  host.innerHTML = `<ul class="gmedia-hist-list">${items.join('')}</ul>`;
}

export async function setCoverFromHistory(plantIndex, mediaId) {
  const plant = getPlantByIndex(plantIndex);
  if (!plant?.serverId) return;
  const ctx = requireAuthContext();
  await setPlantCoverMedia({
    supabase: ctx.supabase,
    gardenProfileId: ctx.gardenProfileId,
    gardenPlantId: plant.serverId,
    mediaId
  });
  plant.coverMediaId = mediaId;
  plant.coverSignedUrl = await resolveCoverSignedUrlForPlant({
    supabase: ctx.supabase,
    coverMediaId: mediaId
  });
  if (typeof window.render === 'function') window.render();
  await showPhotoHistory(plantIndex);
  if (typeof window.showPlantPanel === 'function') window.showPlantPanel(plantIndex, 'guide');
}

export async function deleteMediaFromHistory(plantIndex, mediaId) {
  const plant = getPlantByIndex(plantIndex);
  if (!plant?.serverId) return;
  if (!confirm('Delete this plant photo? This cannot be undone.')) return;
  const ctx = requireAuthContext();
  const rows = await listGardenMediaForPlant({
    supabase: ctx.supabase,
    gardenProfileId: ctx.gardenProfileId,
    gardenPlantId: plant.serverId,
    includePending: true
  });
  const row = rows.find((r) => String(r.id) === String(mediaId));
  if (!row) return;
  setStatus(plantIndex, 'Deleting…');
  try {
    await deleteGardenMediaAsset({
      supabase: ctx.supabase,
      mediaRow: row,
      gardenProfileId: ctx.gardenProfileId
    });
  } catch (err) {
    setStatus(plantIndex, gardenMediaUserErrorMessage(err), true);
    throw err;
  }
  if (String(plant.coverMediaId) === String(mediaId)) {
    plant.coverMediaId = null;
    plant.coverSignedUrl = '';
    // Reload plant cover from server if another photo was promoted
    try {
      await ctx.api.hydrateActiveGardenPlants?.();
      const refreshed = getPlantByIndex(plantIndex);
      if (refreshed?.coverMediaId) {
        plant.coverMediaId = refreshed.coverMediaId;
        plant.coverSignedUrl = await resolveCoverSignedUrlForPlant({
          supabase: ctx.supabase,
          coverMediaId: refreshed.coverMediaId
        });
      }
    } catch (_) {}
  }
  setStatus(plantIndex, 'Photo deleted.');
  if (typeof window.render === 'function') window.render();
  await showPhotoHistory(plantIndex);
  if (typeof window.showPlantPanel === 'function') window.showPlantPanel(plantIndex, 'guide');
}

function onDocumentClick(ev) {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  const add = t.closest('[data-gmedia-add]');
  if (add) {
    ev.preventDefault();
    openAddPhotoPicker(Number(add.getAttribute('data-gmedia-add')));
    return;
  }
  const hist = t.closest('[data-gmedia-history]');
  if (hist) {
    ev.preventDefault();
    showPhotoHistory(Number(hist.getAttribute('data-gmedia-history'))).catch((err) => {
      alert(gardenMediaUserErrorMessage(err));
    });
    return;
  }
  const cover = t.closest('[data-gmedia-cover]');
  if (cover) {
    ev.preventDefault();
    setCoverFromHistory(
      Number(cover.getAttribute('data-gmedia-plant')),
      cover.getAttribute('data-gmedia-cover')
    ).catch((err) => alert(gardenMediaUserErrorMessage(err)));
    return;
  }
  const del = t.closest('[data-gmedia-delete]');
  if (del) {
    ev.preventDefault();
    deleteMediaFromHistory(
      Number(del.getAttribute('data-gmedia-plant')),
      del.getAttribute('data-gmedia-delete')
    ).catch((err) => alert(gardenMediaUserErrorMessage(err)));
  }
}

function injectMinimalCss() {
  if (document.getElementById('gardenMediaV1Css')) return;
  const style = document.createElement('style');
  style.id = 'gardenMediaV1Css';
  style.textContent = `
.gmedia-panel{margin:12px 0 16px;padding:12px 0;border-top:1px solid rgba(20,59,40,.12)}
.gmedia-head{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}
.gmedia-lede{font-size:12px;opacity:.75}
.gmedia-cover{height:160px;border-radius:12px;background:#e8efe9 center/cover no-repeat;margin-bottom:8px}
.gmedia-cover-empty{display:flex;align-items:center;justify-content:center;color:#5a6b5e;font-size:14px;background:#eef3ef}
.gmedia-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.gmedia-note,.gmedia-status{font-size:13px;margin:6px 0 0}
.gmedia-error{color:#8b2e2e}
.gmedia-hist-list{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.gmedia-hist-item{display:flex;gap:10px;align-items:center}
.gmedia-hist-thumb{width:56px;height:56px;border-radius:8px;background:#dfe8e1 center/cover no-repeat;flex:0 0 auto}
.gmedia-hist-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.gmedia-hist-actions button{font-size:12px}
`;
  document.head.appendChild(style);
}

function boot() {
  injectMinimalCss();
  document.addEventListener('click', onDocumentClick);

  // After plant hydrate, resolve cover signed URLs
  const wrapHydrate = () => {
    const api = pd();
    if (!api || api.__gmediaHydrateWrapped) return;
    const orig = api.hydrateActiveGardenPlants;
    if (typeof orig !== 'function') return;
    api.__gmediaHydrateWrapped = true;
    api.hydrateActiveGardenPlants = async (...args) => {
      const ok = await orig.apply(api, args);
      try {
        if (window.data?.plants) await hydratePlantCoverUrls(window.data.plants);
        if (typeof window.render === 'function') window.render();
      } catch (err) {
        console.warn('[GardenMedia] cover hydrate failed', err);
      }
      return ok;
    };
  };
  wrapHydrate();
  setTimeout(wrapHydrate, 500);
  setTimeout(wrapHydrate, 2000);
}

window.cruvitGardenMediaV1 = {
  openAddPhotoPicker,
  uploadPhotoForPlantIndex,
  showPhotoHistory,
  setCoverFromHistory,
  deleteMediaFromHistory,
  renderPlantMediaSectionHtml,
  hydratePlantCoverUrls,
  clearGardenMediaSignedUrlCache,
  gardenMediaUserErrorMessage
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
