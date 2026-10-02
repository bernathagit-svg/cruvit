import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantDetailRenderContract,
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
