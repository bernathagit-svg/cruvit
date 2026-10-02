import { slotByIndex } from './my-plants-approved-layout.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function cardImage(card) {
  if (card.cover?.kind === 'personal') {
    return Object.freeze({
      kind: 'personal',
      mediaId: card.cover.personalMediaId,
      storageBucket: card.cover.storageBucket ?? null,
      storagePath: card.cover.storagePath ?? null,
      systemImageKey: card.cover.systemImageKey ?? null,
    });
  }
  return Object.freeze({
    kind: 'system',
    mediaId: null,
    systemImageKey: card.cover?.systemImageKey ?? card.profileSlug ?? null,
  });
}

export function buildApprovedMyPlantsRenderModel(viewModel) {
  if (!viewModel || !Array.isArray(viewModel.cards)) {
    throw new Error('my_plants_view_model_required');
  }

  const ids=new Set();
  const cards=viewModel.cards.map((card)=>{
    if (!card?.id) throw new Error('my_plants_card_id_required');
    if (ids.has(card.id)) throw new Error('duplicate_my_plants_render_card:'+card.id);
    ids.add(card.id);

    if (card.cameraAction?.plantId !== card.id) {
      throw new Error('my_plants_camera_identity_mismatch:'+card.id);
    }

    return Object.freeze({
      plantId: card.id,
      name: card.name ?? '',
      scientificName: card.scientificName ?? null,
      status: card.status ?? null,
      areaName: card.area?.areaName ?? null,
      positionLabel: card.positionLabel ?? null,
      image: cardImage(card),
      actions: Object.freeze({
        open: Object.freeze({action:'open_plant',plantId:card.id}),
        camera: Object.freeze({action:'replace_plant_photo',plantId:card.id}),
      }),
    });
  });

  return Object.freeze({
    activeCount:viewModel.activeCount,
    archivedCount:viewModel.archivedCount,
    cards:Object.freeze(cards),
    visualReference:Object.freeze({
      id:'my-plants',
      locked:true,
      sha256:'64ddc9c59a62482c4050159a8a9109d19a71d1a777ebafc888d6d598d8b531d5',
    }),
  });
}

export function renderMyPlantsInteractionLayer(renderModel) {
  if (!renderModel?.visualReference?.locked) {
    throw new Error('my_plants_visual_reference_required');
  }
  if (renderModel.cards.length > 9) {
    throw new Error('approved_my_plants_layout_capacity_exceeded');
  }

  return renderModel.cards.map((card,index)=>{
    const slot=slotByIndex(index);
    return '<article class="my-plants-runtime-card" data-plant-id="'+esc(card.plantId)+'" '+
      'style="position:absolute;left:'+slot.left.toFixed(6)+'%;top:'+slot.top.toFixed(6)+'%;width:'+slot.width.toFixed(6)+'%;height:'+slot.height.toFixed(6)+'%">'+
      '<button type="button" class="my-plants-open-hit" data-action="open_plant" data-plant-id="'+esc(card.plantId)+'" aria-label="Open '+esc(card.name)+'" '+
        'style="position:absolute;inset:0;border:0;background:transparent"></button>'+
      '<button type="button" class="my-plants-camera-hit" data-action="replace_plant_photo" data-plant-id="'+esc(card.plantId)+'" aria-label="Change photo for '+esc(card.name)+'" '+
        'style="position:fixed;left:'+slot.cameraLeft.toFixed(6)+'%;top:'+slot.cameraTop.toFixed(6)+'%;width:34px;height:34px"></button>'+
    '</article>';
  }).join('');
}

export function assertMyPlantsVisualAcceptanceReady(renderModel) {
  if (!renderModel?.visualReference?.locked) throw new Error('visual_reference_not_locked');
  if (renderModel.visualReference.sha256 !== '64ddc9c59a62482c4050159a8a9109d19a71d1a777ebafc888d6d598d8b531d5') {
    throw new Error('my_plants_visual_reference_fingerprint_mismatch');
  }
  return true;
}
