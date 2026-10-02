import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MY_PLANTS_APPROVED_LAYOUT,
  percentStyle,
} from '../modules/my-garden-v2/my-plants-approved-layout.js';
import {
  renderApprovedMyPlantsOverlay,
  renderApprovedPlantDetailPhotoOverlay,
} from '../modules/my-garden-v2/my-plants-approved-renderer.js';

test('approved My Plants geometry remains the exact v2 layout contract',()=>{
  assert.equal(MY_PLANTS_APPROVED_LAYOUT.viewport.width,941);
  assert.equal(MY_PLANTS_APPROVED_LAYOUT.viewport.height,1672);
  assert.equal(MY_PLANTS_APPROVED_LAYOUT.slots.length,9);
  assert.deepEqual(
    MY_PLANTS_APPROVED_LAYOUT.slots[0],
    {
      plantKey:'lemon-01',
      left:5.207226,
      top:24.401914,
      width:27.736451,
      height:9.688995,
      cameraLeft:28.374070,
      cameraTop:25.000000,
    }
  );
  assert.deepEqual(MY_PLANTS_APPROVED_LAYOUT.detail.heroUserPhoto,{
    left:44.633369,
    top:0,
    width:55.366631,
    height:26.555024,
  });
});

test('renderer overlays personal image only inside approved photo slot',()=>{
  const html=renderApprovedMyPlantsOverlay({
    approvedArtworkUrl:'/approved/my-plants.png',
    resolveMediaUrl:()=>'/media/lemon.jpg',
    viewModel:{
      cards:[{
        id:'p1',
        name:'Lemon tree',
        cover:{kind:'personal',personalMediaId:'m1'},
      }],
    },
  });
  assert.match(html,/data-visual-contract="my-plants-2\.10"/);
  assert.match(html,/left:5\.207226%;top:24\.401914%;width:27\.736451%;height:9\.688995%/);
  assert.match(html,/left:28\.374070%;top:25\.000000%/);
  assert.match(html,/data-plant-id="p1"/);
});

test('system image fallback does not add a personal-photo overlay',()=>{
  const html=renderApprovedMyPlantsOverlay({
    approvedArtworkUrl:'/approved/my-plants.png',
    resolveMediaUrl:()=>'/media/should-not-be-used.jpg',
    viewModel:{
      cards:[{
        id:'p1',
        name:'Lemon tree',
        cover:{kind:'system',personalMediaId:null},
      }],
    },
  });
  assert.doesNotMatch(html,/class="card-user-photo"/);
  assert.match(html,/class="plant-camera"/);
});

test('Plant Detail uses the same personal media in approved hero and card slots',()=>{
  const html=renderApprovedPlantDetailPhotoOverlay({
    approvedArtworkUrl:'/approved/overview.png',
    resolveMediaUrl:()=>'/media/lemon.jpg',
    viewModel:{
      plant:{
        id:'p1',
        name:'Lemon tree',
        cover:{kind:'personal',personalMediaId:'m1'},
      },
    },
  });
  assert.match(html,/class="detail-hero-user-photo"/);
  assert.match(html,/left:44\.633369%;top:0\.000000%;width:55\.366631%;height:26\.555024%/);
  assert.match(html,/class="detail-card-user-photo"/);
  assert.match(html,/left:7\.651435%;top:31\.638756%;width:38\.150903%;height:19\.258373%/);
});

test('approved layout has a hard capacity rather than inventing a tenth position',()=>{
  assert.throws(
    ()=>renderApprovedMyPlantsOverlay({
      approvedArtworkUrl:'/approved/my-plants.png',
      viewModel:{
        cards:Array.from({length:10},(_,i)=>({
          id:'p'+i,
          name:'Plant '+i,
          cover:{kind:'system'},
        })),
      },
    }),
    /approved_my_plants_layout_capacity_exceeded/
  );
});
