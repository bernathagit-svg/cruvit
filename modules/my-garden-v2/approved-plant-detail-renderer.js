import { MY_PLANTS_APPROVED_LAYOUT, percentStyle } from './my-plants-approved-layout.js';

const TAB_REFERENCE_SHA = Object.freeze({
  overview:'eab2a113e2a14d11eef09e8e4bbca31bb373c4034a0ab77b9bd651237def7b5a',
  care:'5881d6f3856b8b7d3b1ea8177c5812e64042ed17f1caf74293a9ee70c4316c7a',
  schedule:'ad56e981c75e407a5601190fdf3ac212fe5607e39bec94d52c683d9aa58dea75',
  history:'a9be08e731153677bbc4a89291c603cdbfeaac576b3a67ac41d83a2c783dbfa2',
});

function requireTab(tab) {
  if (!TAB_REFERENCE_SHA[tab]) throw new Error('invalid_plant_detail_render_tab:'+tab);
  return tab;
}

export function buildPlantDetailRenderContract(baseViewModel) {
  const plant=baseViewModel?.plant;
  if (!plant?.id) throw new Error('plant_detail_render_identity_required');
  const tab=requireTab(baseViewModel.activeTab);

  if (!baseViewModel.readOnly) {
    if (baseViewModel.photoAction?.plantId !== plant.id) {
      throw new Error('plant_detail_photo_action_identity_mismatch:'+plant.id);
    }
    if (baseViewModel.restoreSystemPhotoAction?.plantId !== plant.id) {
      throw new Error('plant_detail_restore_action_identity_mismatch:'+plant.id);
    }
  }

  return Object.freeze({
    plantId:plant.id,
    activeTab:tab,
    identity:Object.freeze({
      name:plant.name ?? '',
      scientificName:plant.scientificName ?? null,
      status:plant.status ?? null,
      areaName:plant.area?.areaName ?? null,
      positionLabel:plant.positionLabel ?? null,
    }),
    cover:plant.cover,
    readOnly:baseViewModel.readOnly === true,
    actions:Object.freeze({
      photo:baseViewModel.photoAction ?? null,
      restoreSystemPhoto:baseViewModel.restoreSystemPhotoAction ?? null,
    }),
    visualReference:Object.freeze({
      id:'plant-'+tab,
      sha256:TAB_REFERENCE_SHA[tab],
      locked:true,
    }),
  });
}


function esc(value) {
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

export function renderPlantDetailPersonalPhotoLayer(contract,signedMedia) {
  if (!contract?.visualReference?.locked) {
    throw new Error('plant_detail_visual_reference_required');
  }
  if (contract.cover?.kind !== 'personal') return '';

  const signedUrl=signedMedia?.signedUrl ?? signedMedia ?? null;
  if (!signedUrl) return '';

  const d=MY_PLANTS_APPROVED_LAYOUT.detail;
  return '<img class="detail-hero-user-photo" data-plant-id="'+esc(contract.plantId)+'" src="'+esc(signedUrl)+'" alt="" '+
    'style="position:absolute;z-index:6;object-fit:cover;border-radius:0 0 0 28px;'+percentStyle(d.heroUserPhoto)+'">'+
    '<div class="detail-hero-fade" aria-hidden="true" style="position:absolute;z-index:7;pointer-events:none;'+percentStyle(d.heroFade)+';background:linear-gradient(90deg,rgba(7,24,13,.82),rgba(7,24,13,0))"></div>'+
    '<img class="detail-card-user-photo" data-plant-id="'+esc(contract.plantId)+'" src="'+esc(signedUrl)+'" alt="" '+
    'style="position:absolute;z-index:6;object-fit:cover;border-radius:18px;'+percentStyle(d.cardUserPhoto)+'">';
}

export function renderPlantDetailPhotoInteractionLayer(contract) {
  if (!contract?.visualReference?.locked) {
    throw new Error('plant_detail_visual_reference_required');
  }
  if (contract.readOnly) return '';

  const d=MY_PLANTS_APPROVED_LAYOUT.detail;
  return '<button type="button" class="plant-camera detail-camera" data-action="replace_plant_photo" data-plant-id="'+esc(contract.plantId)+'" '+
    'aria-label="Change plant photo" style="position:absolute;left:'+d.detailCamera.left.toFixed(6)+'%;top:'+d.detailCamera.top.toFixed(6)+'%;width:'+d.detailCamera.widthPx+'px;height:'+d.detailCamera.heightPx+'px"></button>'+
    '<button type="button" class="plant-camera detail-card-camera" data-action="replace_plant_photo" data-plant-id="'+esc(contract.plantId)+'" '+
    'aria-label="Change plant photo" style="position:absolute;left:'+d.cardCamera.left.toFixed(6)+'%;top:'+d.cardCamera.top.toFixed(6)+'%;width:'+d.cardCamera.widthPx+'px;height:'+d.cardCamera.heightPx+'px"></button>';
}

export function assertPlantDetailRenderSync(myPlantsRenderModel, detailRenderContract) {
  const card=myPlantsRenderModel?.cards?.find((row)=>row.plantId===detailRenderContract?.plantId);
  if (!card) throw new Error('detail_plant_missing_from_my_plants:'+String(detailRenderContract?.plantId ?? ''));

  const cardCover=JSON.stringify(card.image ?? null);
  const detailCover=JSON.stringify(detailRenderContract.cover ?? null);

  // Compare the canonical media/system identity rather than CSS/render geometry.
  const cardMedia=card.image?.kind==='personal'
    ? 'personal:'+card.image.mediaId
    : 'system:'+String(card.image?.systemImageKey ?? '');
  const detailMedia=detailRenderContract.cover?.kind==='personal'
    ? 'personal:'+detailRenderContract.cover.personalMediaId
    : 'system:'+String(detailRenderContract.cover?.systemImageKey ?? '');

  if (cardMedia !== detailMedia) {
    throw new Error('my_plants_detail_cover_mismatch:'+detailRenderContract.plantId);
  }

  return true;
}

export function assertPlantDetailVisualReference(contract) {
  const tab=requireTab(contract?.activeTab);
  if (contract.visualReference?.sha256 !== TAB_REFERENCE_SHA[tab]) {
    throw new Error('plant_detail_visual_reference_mismatch:'+tab);
  }
  if (contract.visualReference?.locked !== true) {
    throw new Error('plant_detail_visual_reference_not_locked:'+tab);
  }
  return true;
}

export const PLANT_DETAIL_REFERENCE_SHA = TAB_REFERENCE_SHA;
