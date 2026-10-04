import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantDetailRenderContract,
  renderPlantDetailPersonalPhotoLayer,
  renderPlantDetailPhotoInteractionLayer,
  assertPlantDetailRenderSync,
  assertPlantDetailVisualReference,
} from '../modules/my-garden-v2/approved-plant-detail-renderer.js';
import { buildApprovedMyPlantsRenderModel } from '../modules/my-garden-v2/approved-my-plants-renderer.js';

const plant={
  id:'p1',
  name:'Lemon tree',
  scientificName:'Citrus × limon',
  status:'Growing well',
  area:{areaName:'Backyard'},
  positionLabel:null,
  cover:{
    kind:'personal',
    personalMediaId:'m1',
    systemImageKey:'lemon',
    storageBucket:'user-garden-media',
    storagePath:'u/g/m1/lemon.jpg',
  },
};

function detail(tab){
  return {
    plant,
    activeTab:tab,
    tabs:['overview','care','schedule','history'],
    readOnly:false,
    photoAction:{action:'replace_plant_photo',plantId:'p1'},
    restoreSystemPhotoAction:{action:'restore_system_photo',plantId:'p1'},
  };
}

const myPlants=buildApprovedMyPlantsRenderModel({
  activeCount:1,
  archivedCount:0,
  cards:[{
    ...plant,
    profileSlug:'lemon',
    cameraAction:{action:'replace_plant_photo',plantId:'p1'},
  }],
});

test('all approved Plant Detail tabs preserve same plant identity',()=>{
  for(const tab of ['overview','care','schedule','history']){
    const contract=buildPlantDetailRenderContract(detail(tab));
    assert.equal(contract.plantId,'p1');
    assert.equal(contract.activeTab,tab);
    assert.equal(assertPlantDetailVisualReference(contract),true);
  }
});

test('My Plants and Plant Detail use same personal cover identity',()=>{
  for(const tab of ['overview','care','schedule','history']){
    const contract=buildPlantDetailRenderContract(detail(tab));
    assert.equal(assertPlantDetailRenderSync(myPlants,contract),true);
  }
});

test('detail tab cannot silently use another plant for photo action',()=>{
  assert.throws(
    ()=>buildPlantDetailRenderContract({
      ...detail('overview'),
      photoAction:{action:'replace_plant_photo',plantId:'p2'},
    }),
    /photo_action_identity_mismatch/
  );
});

test('system-photo state syncs by canonical system image key',()=>{
  const systemPlant={
    ...plant,
    cover:{kind:'system',personalMediaId:null,systemImageKey:'lemon'},
  };
  const list=buildApprovedMyPlantsRenderModel({
    activeCount:1,
    archivedCount:0,
    cards:[{
      ...systemPlant,
      profileSlug:'lemon',
      cameraAction:{action:'replace_plant_photo',plantId:'p1'},
    }],
  });
  const contract=buildPlantDetailRenderContract({
    ...detail('overview'),
    plant:systemPlant,
  });
  assert.equal(assertPlantDetailRenderSync(list,contract),true);
});


test('personal photo renders in approved hero and detail-card slots',()=>{
  const contract=buildPlantDetailRenderContract(detail('overview'));
  const html=renderPlantDetailPersonalPhotoLayer(contract,{signedUrl:'https://signed.example/lemon'});
  assert.match(html,/class="detail-hero-user-photo"/);
  assert.match(html,/left:44\.633369%;top:0\.000000%;width:55\.366631%;height:26\.555024%/);
  assert.match(html,/class="detail-card-user-photo"/);
  assert.match(html,/left:7\.651435%;top:31\.638756%;width:38\.150903%;height:19\.258373%/);
  assert.match(html,/https:\/\/signed\.example\/lemon/);
});

test('photo interaction layer uses locked detail camera geometry',()=>{
  const contract=buildPlantDetailRenderContract(detail('overview'));
  const html=renderPlantDetailPhotoInteractionLayer(contract);
  assert.match(html,/left:70\.563231%;top:1\.136364%;width:50px;height:50px/);
  assert.match(html,/left:38\.894793%;top:47\.009569%;width:44px;height:44px/);
  assert.match(html,/data-plant-id="p1"/);
});

test('archived read-only detail has no photo interaction controls',()=>{
  const contract=buildPlantDetailRenderContract({
    ...detail('history'),
    readOnly:true,
    photoAction:null,
    restoreSystemPhotoAction:null,
  });
  assert.equal(renderPlantDetailPhotoInteractionLayer(contract),'');
});

test('missing signed personal media falls back to approved system artwork',()=>{
  const contract=buildPlantDetailRenderContract(detail('overview'));
  assert.equal(renderPlantDetailPersonalPhotoLayer(contract,null),'');
});
