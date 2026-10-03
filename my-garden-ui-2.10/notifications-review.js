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
function hydrate(){
 const vm=buildNotificationsScreenViewModel({plants,tasks,today:'2026-10-02',plantId:null,filter:'attention'});
 const model=buildApprovedNotificationsRenderModel(vm);
 assertNotificationsVisualAcceptanceReady(model);
 const plan=buildNotificationsHydrationPlan(model);
 assertHydrationDoesNotTouchFrozenVisual(plan);
 const doc=frame.contentDocument;
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
