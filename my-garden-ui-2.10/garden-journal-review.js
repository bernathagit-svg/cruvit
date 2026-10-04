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

const APPROVED_VIEWPORT = Object.freeze({ width:941, height:1672 });

function installFullScreenAppShell(doc){
  if(!doc || doc.getElementById('cruvit-full-screen-app-shell')) return;

  const style=doc.createElement('style');
  style.id='cruvit-full-screen-app-shell';
  style.textContent=`
    html,body{
      margin:0!important;
      background:#07150d!important;
      overflow-x:hidden!important;
    }
    body{place-items:initial!important}
    .phone{
      max-width:none!important;
      margin:0!important;
      box-shadow:none!important;
      border:0!important;
      border-radius:0!important;
    }
  `;
  doc.head.appendChild(style);

  const fit=()=>{
    const phone=doc.querySelector('.phone');
    if(!phone) throw new Error('journal_approved_phone_root_missing');

    const viewportWidth=Math.max(1,frame.clientWidth||window.innerWidth||APPROVED_VIEWPORT.width);
    const viewportHeight=Math.max(1,frame.clientHeight||window.innerHeight||APPROVED_VIEWPORT.height);

    if(viewportWidth<=APPROVED_VIEWPORT.width){
      const scale=viewportWidth/APPROVED_VIEWPORT.width;
      const requiredUnscaledHeight=Math.max(
        APPROVED_VIEWPORT.height,
        Math.ceil(viewportHeight/scale)
      );

      doc.body.style.width=APPROVED_VIEWPORT.width+'px';
      doc.body.style.minHeight=requiredUnscaledHeight+'px';
      doc.body.style.zoom=String(scale);
      phone.style.width=APPROVED_VIEWPORT.width+'px';
      phone.style.minHeight=requiredUnscaledHeight+'px';
    }else{
      doc.body.style.width='100%';
      doc.body.style.minHeight='100vh';
      doc.body.style.zoom='1';
      phone.style.width='100%';
      phone.style.minHeight='100vh';
    }

    doc.documentElement.dataset.runtimeShell='full-screen-app';
  };

  fit();
  window.addEventListener('resize',fit,{passive:true});
}

function hydrate(){
 const vm=buildGardenJournalScreenViewModel({plants,events,query:'',plantId:null,eventType:'all',scope:'all'});
 const model=buildApprovedGardenJournalRenderModel(vm);
 assertGardenJournalVisualAcceptanceReady(model);
 const plan=buildGardenJournalHydrationPlan(model);
 assertHydrationDoesNotTouchFrozenVisual(plan);
 const doc=frame.contentDocument;
 installFullScreenAppShell(doc);
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
