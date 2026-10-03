import { buildGardenJournalScreenViewModel } from '../modules/my-garden-v2/event-screen-view-models.js';
import { buildApprovedGardenJournalRenderModel, assertGardenJournalVisualAcceptanceReady } from '../modules/my-garden-v2/approved-garden-journal-renderer.js';
import { buildGardenJournalHydrationPlan, assertHydrationDoesNotTouchFrozenVisual } from '../modules/my-garden-v2/group-2-approved-template-hydration.js';

const plants=Object.freeze([
 {id:'lemon',name:'Lemon tree',archived:false},
 {id:'rose',name:'Rose',archived:false},
 {id:'olive',name:'Olive tree',archived:false},
 {id:'lavender',name:'Lavender',archived:false},
]);
const events=Object.freeze([
 {id:'e1',garden_plant_id:'lemon',event_type:'care',occurred_at:'2026-10-02T08:00:00Z',payload:{title:'Watered',note:'Soil was slightly dry. Watered thoroughly.'}},
 {id:'e2',garden_plant_id:'rose',event_type:'observation',occurred_at:'2026-10-01T08:00:00Z',payload:{title:'Light check',note:'Getting full sun. No change needed.'}},
 {id:'e3',garden_plant_id:'olive',event_type:'photo',occurred_at:'2026-09-30T08:00:00Z',payload:{title:'Photo added',note:'New growth on the south-facing side.',media_id:'media-olive-1'}},
 {id:'e4',garden_plant_id:'lavender',event_type:'note',occurred_at:'2026-09-28T08:00:00Z',payload:{title:'Note added',note:'Flowering is slowing down. Fragrance still strong.'}},
 {id:'e5',garden_plant_id:'lemon',event_type:'care',occurred_at:'2026-09-24T08:00:00Z',payload:{title:'Fertilized',note:'Used organic citrus fertilizer.'}},
 ...Array.from({length:7},(_,i)=>({id:'e'+(i+6),garden_plant_id:['lemon','rose','olive','lavender'][i%4],event_type:'note',occurred_at:'2026-09-'+String(23-i).padStart(2,'0')+'T08:00:00Z',payload:{title:'Garden note '+(i+1),note:'Approved review fixture.'}}))
]);

const frame=document.querySelector('#review-frame');
function hydrate(){
 const vm=buildGardenJournalScreenViewModel({plants,events,query:'',plantId:null,eventType:'all',scope:'all'});
 const model=buildApprovedGardenJournalRenderModel(vm);
 assertGardenJournalVisualAcceptanceReady(model);
 const plan=buildGardenJournalHydrationPlan(model);
 assertHydrationDoesNotTouchFrozenVisual(plan);
 const doc=frame.contentDocument;
 for(const patch of plan.patches){
   const node=doc.querySelector(patch.selector);
   if(!node) throw new Error('journal_review_selector_missing:'+patch.selector);
   node.textContent=String(patch.value);
 }
 frame.dataset.contract='hydrated';
 frame.dataset.resultCount=String(model.resultCount);
 document.documentElement.dataset.reviewReady='true';
}
if(frame.contentDocument?.readyState==='complete') hydrate();
else frame.addEventListener('load',hydrate,{once:true});
