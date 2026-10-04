import { buildNotificationsScreenViewModel } from '../modules/my-garden-v2/task-screen-view-models.js';
import { buildApprovedNotificationsRenderModel, assertNotificationsVisualAcceptanceReady } from '../modules/my-garden-v2/approved-notifications-renderer.js';
import { buildNotificationsHydrationPlan, assertHydrationDoesNotTouchFrozenVisual } from '../modules/my-garden-v2/group-2-approved-template-hydration.js';

const plants=Object.freeze([
 {id:'lemon',name:'Lemon tree',archived:false},
 {id:'rose',name:'Rose',archived:false},
]);
const tasks=Object.freeze([
 {id:'t-overdue',garden_plant_id:'lemon',title:'Fertilize',task_type:'fertilizing',due_on:'2026-10-01',done:false},
 {id:'t-water',garden_plant_id:'lemon',title:'Water',task_type:'watering',due_on:'2026-10-02',done:false},
 {id:'t-rose',garden_plant_id:'rose',title:'Check leaves',task_type:'inspect',due_on:'2026-10-02',done:false},
 {id:'t-future',garden_plant_id:'rose',title:'Prune',task_type:'pruning',due_on:'2026-10-05',done:false},
 {id:'t-done',garden_plant_id:'lemon',title:'Water',task_type:'watering',due_on:'2026-10-01',done:true},
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
      width:100%!important;
      min-height:100%!important;
      background:#07150d!important;
      overflow-x:hidden!important;
    }
    body{display:block!important;place-items:initial!important}
    .phone{
      width:100%!important;
      max-width:none!important;
      margin:0!important;
      min-height:100vh!important;
      box-shadow:none!important;
      border:0!important;
      border-radius:0!important;
    }
  `;
  doc.head.appendChild(style);

  const fit=()=>{
    const phone=doc.querySelector('.phone');
    if(!phone) throw new Error('notifications_approved_phone_root_missing');
    const viewportWidth=Math.max(1,frame.clientWidth||window.innerWidth||APPROVED_VIEWPORT.width);
    const viewportHeight=Math.max(1,frame.clientHeight||window.innerHeight||APPROVED_VIEWPORT.height);

    if(viewportWidth<=APPROVED_VIEWPORT.width){
      const scale=viewportWidth/APPROVED_VIEWPORT.width;
      const requiredUnscaledHeight=Math.max(APPROVED_VIEWPORT.height,Math.ceil(viewportHeight/scale));
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
 const vm=buildNotificationsScreenViewModel({plants,tasks,today:'2026-10-02',plantId:null,filter:'attention'});
 const model=buildApprovedNotificationsRenderModel(vm);
 assertNotificationsVisualAcceptanceReady(model);
 const plan=buildNotificationsHydrationPlan(model);
 assertHydrationDoesNotTouchFrozenVisual(plan);
 const doc=frame.contentDocument;
 installFullScreenAppShell(doc);
 for(const patch of plan.patches){
   const node=doc.querySelector(patch.selector);
   if(!node) throw new Error('notifications_review_selector_missing:'+patch.selector);
   node.textContent=String(patch.value);
 }
 frame.dataset.contract='hydrated';
 frame.dataset.attentionCount=String(model.counts.attention);
 document.documentElement.dataset.reviewReady='true';
}
if(frame.contentDocument?.readyState==='complete') hydrate();
else frame.addEventListener('load',hydrate,{once:true});
