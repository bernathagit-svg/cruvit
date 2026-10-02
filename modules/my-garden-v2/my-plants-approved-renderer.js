import {
  MY_PLANTS_APPROVED_LAYOUT,
  percentStyle,
  slotByIndex,
} from './my-plants-approved-layout.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function cameraSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/></svg>';
}

function photoUrl(card, resolveMediaUrl) {
  if (card?.cover?.kind !== 'personal') return null;
  if (typeof resolveMediaUrl !== 'function') return null;
  return resolveMediaUrl(card.cover);
}

export function renderApprovedMyPlantsOverlay({
  viewModel,
  approvedArtworkUrl,
  resolveMediaUrl,
} = {}) {
  if (!viewModel || !Array.isArray(viewModel.cards)) {
    throw new Error('my_plants_view_model_required');
  }
  if (!approvedArtworkUrl) throw new Error('approved_my_plants_artwork_required');
  if (viewModel.cards.length > MY_PLANTS_APPROVED_LAYOUT.slots.length) {
    throw new Error('approved_my_plants_layout_capacity_exceeded');
  }

  const overlays=[];

  viewModel.cards.forEach((card,index)=>{
    const slot=slotByIndex(index);
    const url=photoUrl(card,resolveMediaUrl);

    if (url) {
      overlays.push(
        '<img class="card-user-photo" data-plant-id="'+esc(card.id)+'" '+
        'src="'+esc(url)+'" alt="" style="'+percentStyle(slot)+'">'
      );
    }

    overlays.push(
      '<button type="button" class="plant-camera" '+
      'data-action="replace_plant_photo" data-plant-id="'+esc(card.id)+'" '+
      'aria-label="Change photo for '+esc(card.name || 'plant')+'" '+
      'style="left:'+slot.cameraLeft.toFixed(6)+'%;top:'+slot.cameraTop.toFixed(6)+'%">'+
      cameraSvg()+
      '</button>'
    );
  });

  return '<section class="screen approved-my-plants-active" data-visual-contract="my-plants-2.10">'+
    '<img class="base" src="'+esc(approvedArtworkUrl)+'" alt="">'+
    overlays.join('')+
    '</section>';
}

export function renderApprovedPlantDetailPhotoOverlay({
  viewModel,
  approvedArtworkUrl,
  resolveMediaUrl,
} = {}) {
  if (!viewModel?.plant?.id) throw new Error('plant_detail_view_model_required');
  if (!approvedArtworkUrl) throw new Error('approved_plant_detail_artwork_required');

  const d=MY_PLANTS_APPROVED_LAYOUT.detail;
  const url=photoUrl(viewModel.plant,resolveMediaUrl);

  const photoParts=url ? [
    '<img class="detail-hero-user-photo" data-plant-id="'+esc(viewModel.plant.id)+'" src="'+esc(url)+'" alt="" style="'+percentStyle(d.heroUserPhoto)+'">',
    '<div class="detail-hero-fade" aria-hidden="true" style="'+percentStyle(d.heroFade)+'"></div>',
    '<img class="detail-card-user-photo" data-plant-id="'+esc(viewModel.plant.id)+'" src="'+esc(url)+'" alt="" style="'+percentStyle(d.cardUserPhoto)+'">',
  ] : [];

  return '<section class="screen approved-plant-detail-active" data-visual-contract="plant-detail-2.10">'+
    '<img class="base" src="'+esc(approvedArtworkUrl)+'" alt="">'+
    photoParts.join('')+
    '<button type="button" class="plant-camera detail-camera" data-action="replace_plant_photo" data-plant-id="'+esc(viewModel.plant.id)+'" '+
      'aria-label="Change plant photo" style="left:'+d.detailCamera.left.toFixed(6)+'%;top:'+d.detailCamera.top.toFixed(6)+'%;width:'+d.detailCamera.widthPx+'px;height:'+d.detailCamera.heightPx+'px">'+cameraSvg()+'</button>'+
    '<button type="button" class="plant-camera detail-card-camera" data-action="replace_plant_photo" data-plant-id="'+esc(viewModel.plant.id)+'" '+
      'aria-label="Change plant photo" style="left:'+d.cardCamera.left.toFixed(6)+'%;top:'+d.cardCamera.top.toFixed(6)+'%;width:'+d.cardCamera.widthPx+'px;height:'+d.cardCamera.heightPx+'px">'+cameraSvg()+'</button>'+
    '</section>';
}
