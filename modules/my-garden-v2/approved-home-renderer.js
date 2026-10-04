const TILE_ASSET_BASE =
  'https://my-garden-photo-tags--frolicking-kitten-996691.netlify.app/assets/';

const HOME_ICONS = Object.freeze({
  brand:'<path d="M14 29V12m0 2C5 14 3 7 3 3c6 0 11 4 11 11Zm0 0c9 0 11-7 11-11-6 0-11 4-11 11Z"/>',
  search:'<circle cx="11" cy="11" r="6"/><path d="m16 16 5 5"/>',
  profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',
  home:'<path d="m3 11 9-8 9 8v10h-6v-6H9v6H3Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  bell:'<path d="M5 17c2-3 1-5 2-9a5 5 0 0 1 10 0c1 4 0 6 2 9H5Zm5 3c1 2 3 2 4 0M12 1v2"/>',
  menu:'<path d="M4 5h16M4 12h16M4 19h16"/>',
  arrow:'<path d="m8 3 8 9-8 9"/>',
});

const PHOTO_ICON =
  '<svg viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="3" y="6" width="19" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="11" r="2" fill="currentColor"/><path d="m5 21 5-6 4 4 4-6 3 7v2H5Z" fill="currentColor"/><path d="M23 2v8m-4-4h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function icon(name) {
  if (!HOME_ICONS[name]) throw new Error('unknown_home_icon:' + name);
  const viewBox = name === 'brand' ? '0 0 28 30' : '0 0 24 24';
  return '<svg viewBox="' + viewBox + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    HOME_ICONS[name] +
    '</svg>';
}

function tile(key,label,count='') {
  const safeCount = count === '' || count == null ? '' : String(count);
  return '<button type="button" class="botanical-tile" data-tile="' + esc(key) + '" data-latest-home="' + esc(key) + '" aria-label="' +
    esc(label) + (safeCount ? ' ' + esc(safeCount) : '') + '">' +
    '<img src="' + TILE_ASSET_BASE + 'tile-' + esc(key) + '.png" width="212" height="262" alt="" aria-hidden="true" draggable="false">' +
    '<span class="botanical-tile-label">' + esc(label) + '</span>' +
    (safeCount ? '<small>' + esc(safeCount) + '</small>' : '') +
    '</button>';
}

function attentionText(viewModel) {
  const items = [
    ...(viewModel.attentionItems || []),
    ...(viewModel.attentionPreview ? [viewModel.attentionPreview] : []),
  ];

  const seen = new Set();
  const labels = [];

  for (const item of items) {
    const id = item?.id ?? item?.taskId ?? null;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);

    let text = item?.displayText ?? item?.detail ?? null;
    if (!text && item?.type === 'task') {
      const plant = item.plantName ? String(item.plantName) : '';
      const title = item.title ? String(item.title) : '';
      text = [plant,title].filter(Boolean).join(' · ');
    }
    if (!text && item?.title) text = String(item.title);
    if (text) labels.push(text);
    if (labels.length === 2) break;
  }

  return labels.join(' · ');
}

export function renderApprovedMyGardenHome(viewModel) {
  if (!viewModel?.counts) throw new Error('home_view_model_required');

  const plantCount = viewModel.counts.plants;
  const upcomingCount = viewModel.counts.upcoming;
  const attentionCount = viewModel.counts.attention;
  const attention = attentionText(viewModel);

  if (!Number.isInteger(plantCount) || plantCount < 0) throw new Error('invalid_home_plant_count');
  if (!Number.isInteger(upcomingCount) || upcomingCount < 0) throw new Error('invalid_home_upcoming_count');
  if (!Number.isInteger(attentionCount) || attentionCount < 0) throw new Error('invalid_home_attention_count');

  return '<section class="precision-shell" aria-label="My Garden, locked working photo-tags baseline">' +
    '<div class="pg-scene botanical-scene" data-release="botanical-v2">' +
      '<header class="pg-top"><div class="pg-brand">' + icon('brand') + '<span>CRUVIT</span></div>' +
      '<div class="pg-tools"><button type="button" data-latest-home="search" aria-label="Search plants">' + icon('search') + '</button>' +
      '<button type="button" data-latest-home="profile" aria-label="Profile">' + icon('profile') + '</button></div></header>' +
      '<button type="button" class="pg-photo-button" data-gp-personalize aria-label="Change garden photo and tag your plants">' +
        PHOTO_ICON + '<span>Change garden photo</span></button>' +
      '<div class="pg-quick" aria-label="Garden tools">' +
        tile('plants','My Plants',plantCount) +
        tile('upcoming','Upcoming',upcomingCount) +
        tile('journal','Garden Journal') +
        tile('add','Add Plant') +
      '</div>' +
      '<button type="button" class="pg-attention" data-latest-home="attention">' +
        '<span class="pg-badge">' + esc(attentionCount) + '</span>' +
        '<span><strong>Need your attention</strong><small>' + esc(attention) + '</small></span>' +
        icon('arrow') +
      '</button>' +
      '<nav class="pg-nav" aria-label="Main navigation">' +
        '<button type="button" data-latest-home="global-home">' + icon('home') + '<small>Home</small></button>' +
        '<button type="button" class="pg-active" data-latest-home="garden" aria-current="page">' + icon('brand') + '<small>My Garden</small></button>' +
        '<button type="button" class="pg-add" data-latest-home="add" aria-label="Add to garden">' + icon('plus') + '</button>' +
        '<button type="button" data-latest-home="notifications">' + icon('bell') + '<span class="pg-notification-dot"></span><small>Notifications</small></button>' +
        '<button type="button" data-latest-home="more">' + icon('menu') + '<small>More</small></button>' +
        '<div class="botanical-home-indicator" aria-hidden="true"></div>' +
      '</nav>' +
    '</div>' +
  '</section>';
}

export const APPROVED_HOME_STATIC_CLASSES = Object.freeze([
  'precision-shell',
  'pg-scene',
  'botanical-scene',
  'pg-top',
  'pg-brand',
  'pg-tools',
  'pg-photo-button',
  'pg-quick',
  'botanical-tile',
  'botanical-tile-label',
  'pg-attention',
  'pg-badge',
  'pg-nav',
  'pg-active',
  'pg-add',
  'pg-notification-dot',
  'botanical-home-indicator',
]);
