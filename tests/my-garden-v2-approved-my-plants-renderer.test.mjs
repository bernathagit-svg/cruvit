import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApprovedMyPlantsRenderModel,
  renderMyPlantsInteractionLayer,
  assertMyPlantsVisualAcceptanceReady,
} from '../modules/my-garden-v2/approved-my-plants-renderer.js';

const vm={
  activeCount:2,
  archivedCount:1,
  cards:[
    {
      id:'p1',
      name:'Lemon tree',
      scientificName:'Citrus × limon',
      status:'Growing well',
      area:{areaName:'Backyard'},
      positionLabel:null,
      profileSlug:'lemon',
      cover:{
        kind:'personal',
        personalMediaId:'m1',
        storageBucket:'user-garden-media',
        storagePath:'u/g/m1/lemon.jpg',
        systemImageKey:'lemon',
      },
      cameraAction:{action:'replace_plant_photo',plantId:'p1'},
    },
    {
      id:'p2',
      name:'Rose',
      profileSlug:'rose',
      area:{areaName:'Front garden'},
      cover:{kind:'system',systemImageKey:'rose'},
      cameraAction:{action:'replace_plant_photo',plantId:'p2'},
    },
  ],
};

test('render model preserves exact Plant Instance identity',()=>{
  const model=buildApprovedMyPlantsRenderModel(vm);
  assert.deepEqual(model.cards.map((x)=>x.plantId),['p1','p2']);
  assert.equal(model.cards[0].actions.open.plantId,'p1');
  assert.equal(model.cards[0].actions.camera.plantId,'p1');
  assert.equal(model.cards[1].actions.open.plantId,'p2');
  assert.equal(assertMyPlantsVisualAcceptanceReady(model),true);
});

test('personal and system images remain distinct render states',()=>{
  const model=buildApprovedMyPlantsRenderModel(vm);
  assert.equal(model.cards[0].image.kind,'personal');
  assert.equal(model.cards[0].image.mediaId,'m1');
  assert.equal(model.cards[1].image.kind,'system');
  assert.equal(model.cards[1].image.mediaId,null);
});

test('interaction layer contains no business-data copies',()=>{
  const model=buildApprovedMyPlantsRenderModel(vm);
  const html=renderMyPlantsInteractionLayer(model);
  assert.match(html,/data-plant-id="p1"/);
  assert.match(html,/data-action="replace_plant_photo"/);
  assert.doesNotMatch(html,/Growing well/);
  assert.doesNotMatch(html,/Backyard/);
});

test('wrong camera identity fails loudly',()=>{
  const broken={
    ...vm,
    cards:[{...vm.cards[0],cameraAction:{action:'replace_plant_photo',plantId:'p2'}}],
  };
  assert.throws(()=>buildApprovedMyPlantsRenderModel(broken),/camera_identity_mismatch/);
});

test('visual acceptance is tied to approved reference fingerprint',()=>{
  const model=buildApprovedMyPlantsRenderModel(vm);
  assert.equal(model.visualReference.id,'my-plants');
  assert.equal(model.visualReference.locked,true);
  assert.equal(model.visualReference.sha256,'64ddc9c59a62482c4050159a8a9109d19a71d1a777ebafc888d6d598d8b531d5');
});
