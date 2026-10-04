import {
  buildUpcomingListScreenViewModel,
  buildUpcomingCalendarScreenViewModel,
} from '../modules/my-garden-v2/task-screen-view-models.js';

import {
  renderUpcomingListScreen,
  renderUpcomingCalendarScreen,
} from '../modules/my-garden-v2/approved-upcoming-renderer.js';

const plants = Object.freeze([
  { id:'lemon', name:'Lemon', archived:false },
  { id:'lavender', name:'Lavender', archived:false },
  { id:'agave', name:'Agave', archived:false },
  { id:'hydrangea', name:'Hydrangea', archived:false },
  { id:'rosemary', name:'Rosemary', archived:false },
  { id:'olive', name:'Olive', archived:false },
  { id:'rose', name:'Rose', archived:false },
  { id:'basil', name:'Basil', archived:false },
  { id:'mango', name:'Mango', archived:false },
]);

const tasks = Object.freeze([
  { id:'t-water', garden_plant_id:'lemon', title:'Water', task_type:'watering', due_on:'2026-10-02', done:false },
  { id:'t-prune', garden_plant_id:'lavender', title:'Prune', task_type:'pruning', due_on:'2026-10-03', done:false },
  { id:'t-feed', garden_plant_id:'agave', title:'Fertilize', task_type:'fertilizing', due_on:'2026-10-05', done:false },
  { id:'t-pests', garden_plant_id:'hydrangea', title:'Check for pests', task_type:'inspect', due_on:'2026-10-07', done:false },
  { id:'t-harvest', garden_plant_id:'rosemary', title:'Harvest', task_type:'harvest', due_on:'2026-10-08', done:false },
  { id:'t-done-1', garden_plant_id:'olive', title:'Water', task_type:'watering', due_on:'2026-10-01', done:true },
  { id:'t-done-2', garden_plant_id:'rose', title:'Deadhead', task_type:'pruning', due_on:'2026-09-30', done:true },
]);

const calendarVisualTasks = Object.freeze([
  { id:'t-water', garden_plant_id:'lemon', title:'Water', task_type:'watering', due_on:'2026-10-02', done:false },
  { id:'t-harvest', garden_plant_id:'rosemary', title:'Harvest', task_type:'harvest', due_on:'2026-10-02', done:false },
  { id:'t-pests', garden_plant_id:'hydrangea', title:'Check for pests', task_type:'inspect', due_on:'2026-10-02', done:false },
  { id:'t-feed', garden_plant_id:'agave', title:'Fertilize', task_type:'fertilizing', due_on:'2026-10-05', done:false },
  { id:'t-prune', garden_plant_id:'lavender', title:'Prune', task_type:'pruning', due_on:'2026-10-07', done:false },
  { id:'t-done-1', garden_plant_id:'olive', title:'Water', task_type:'watering', due_on:'2026-10-01', done:true },
  { id:'t-done-2', garden_plant_id:'rose', title:'Deadhead', task_type:'pruning', due_on:'2026-09-30', done:true },
]);

const plantVisuals = Object.freeze({
  lemon:'data:image/webp;base64,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',
  lavender:'data:image/webp;base64,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',
  agave:'data:image/webp;base64,UklGRuQIAABXRUJQVlA4INgIAAAQJQCdASpgAGAAPlUkjkUjoiGY7Ae8OAVEoArlWN019pPIRFP0L44avuj3yfStt++dU9Ln+A38DenbO4aWat/seEH1J5lfaQQqusvZeg2oHmm+W/61TCBr9CfzeHmNJzF44Z+APob1TtCxXmGxAF95/zLxQDjeTBHloCyO0zn3gHENovzcniXt7NOXWfCGW6E9MyeV/E3p/a240CNG0Mrs3Lv8bjDx6Y1LqVHV2+H9Y57nVJ80I/tclmgDdI/WbbNQTniN5IRl5VWZ7N235e9ytRZEAxcSmPfi8aAJfX8tHUpD5kVqSOqAUTuo1HddeyYBd8TcqJdWuJvDYqGJ/zDbE2cvsKkdXApRVzD9xa9OAwk1ajuce7EdRQ2tVDGGzAjMfmMlnR99vomXRuTVsT4JEAD+/vXW9WCU5cuRZnCgjY4XXl1qMK0YTAjpkMcBSHJKbe2cU8n/w0IrqcdpZFFvgB5UwJT5YhvKs64acTjSxLXgYYy8LbS0zw7nQPB3CU/n6W1itktPpl1ZEcnFyXEYeTbtz/Nb8Qqo6oFkWTApy+hahpE+OOiTPRtYDWyLSWy6UQN/fDFERUa9yknJMqzMbCUT49MaJjDaU6lGSaWw4vo/m8FpjRPO43a0U6nkkQSFn4a0jFQvB7HH/nHp8MgCmkZR9fPapEqXji4wDtPt288M7hpSVh91+js56MoRrTBMK54nUoXt6LT82fwyozvfy4uL9E30kVYpLYW7ZmCj0yqCxc7i/D9SqZJXvCtd6W0I/DEF5bpEIEu4QZdawBaxZ1vpQ3uPhP3MrpaPOj/pbYOm/SZos0f0qOhYGm5lMeJzB85tVJoV5ub64eLSOsr5IxosQBnIiuyGsXuBEpx2JoQf694rAleYPPmFazVpihCiM0uftqC9xz5kWQIrVTyq94elXPi8lg1Eej4p+ll0BZilwIdnHq+HMNH+/N+wE3IhCT61El1Af6PeXsq+y4hGXFX88KQ8xbJNptkC+Kh4RqygR7fPpo0SFvBTWNqa9fHr5D/mvL9GS3o+edX6PXJlJvIb89AQa8qiu0Tcl5Y2x77iVJlPoO6tvuAc9B8WXptvbE59DJmqJ0FcR8VG4Ht6O/7veD7ZfM6laODfPRsefvuh1yf5TllM/cCH72HyHg70YMxFuJ1i/Pm0Dye7obmMAgKVQy/NOpoyndVTxOs71VjgcAxDyVrxLdPHLhNI8x5zSFr9MPzpxyuO4mWUH1rF+1y4h/qoP4UJU1CAQ1ByeC2ZkD96raK+nwNtiQ7mlc638KG0g7WLqzHTO7n+zzUFp8QIagkRVRqbMLqECgq0Sqc3s/EVYI2BlA+7bqw6mdwqQkjP65o5+8kTfM1lkqMIIttMuBE3uUrlPzcxARWnUSx8De6jYZPZAe5fPvJGUewJ0nayho7cnhDxPEOMoGCZ0f0O2fdJLsUkBH0XXTuOlPkBDEXQMTFCUI33LP/KHlKdRceuIcASok/WoEGxfzePZvlG3CRFJDpxwK+onm+vfxmXkPUyZ7c2R3/q/aa/1yw3PuqqHx+t1yxoakuIQ57O5Qz/jPdwTuso2Kyy030rVignKlBnfwJRctFHseXdQE8sonv+Ssv5o2B1CXynHt1VO5sLykSMKPjUWgxTT7P5AuorP1ucIfW6VvFmmZprhwkenFr8PVFJLwdPB9W8jvqEWVP8qG3FYR+b/BV6ukvrAgADMv3j6yY6+w71KdWDEYXYwabPo/KI6NHlf40R+vkO8T2lJ/dxLSlhm91SYC3KuUqBNuuKVgFnfjGoPuazGCcl76YDosXIhejgpFpGR5Msqvyp/fda/zDdaZ0Pj0oCfeYdyNeexHqyteRwcIqOCiuV+a6kN3HjA0tob1nDVIepGJOaO37nxeRhPrpIJ6rzT7LsT5C2YZBKcjpT6xe57On6wZWV17J+U/V5SS03GYnbrAustIUivAgBplabwDXfA3e4MG/C22UDfwlFBcqx8qrrOdDenLj3Zw0bD0T7nyhu0koS1b0A7FQEf3H1cnyS+OLy1fTA0nvMNPYCOF578X2AAwVvAA1487ysPeXBWIElwUckwGDTGVdm5gyc5U9UW1RHMnXQAjAamMYmO/FXHsc9bJGwqvFtOPYbyffav9qEWYI+YBas5BnBEfS0rgs9A+28xcJ0pV7k0NED0mj68SqRQmUaEX9iUhr1+IeQ7gPiLnUPnQiX2rUtC4Vy1veROON9Ryy4hIFbAPjIMMxv1DzPn4AYbidmY55WanqmTTjxjtJgzB/kdBEbQWEeL5VUE0/plZsV6MH5Z35ZcGtl01hkxBgZ33F3PeOLSV6a6DwXuz+w6Hfdg+9nf2OIL9RP2jXraS7yFq54sTJCikkhobf81RXTY9UqMQLKUF7AeF4zHkKazBrU6Hr5vV7v2NLTwxNJxaF0Q5tEaOJtOzddPCRjISrzqU8a3srom1dKRYcOq7b16mCbnwnJmbGSPoG+FoMm4/vWT1du0swcjoBFLUTOHJiDm6abOkFTiNKbsETqndKFHo+3olMMQaux8WqzzrE6M9kcEbB0qjXQUkPAmruzhjD9nHzDiefrgZLCIQMbnkqyr2+amcN6U+V73is9+nqJ8r3avl6yxUu0KDpMPdapqeYWYboFp5tS8QrPn7hClNfDxBikXoWrnGSqLFMAxfykvBAISd13KP2YKBqrlEWAO0u17y4PC9ON78ZYSOt/6Fr6nGs8TCR27f0gRdqB85ckC65kfqdNBy0CKjsn1kIjb7WnnUll2Mj6AI4j0rGB5sebnhyt/8tFQBF2N1Zq4HmcFoM1sV/SrJ6MplIImMbdDzvDyPammE3kvB9Jf0tusPYYecT+H31LT6eiLdVcsytu5TJqrV5M8156cqzCSIhOqhk8TNqhNT2/XhSnKpBYD7v/ozJ6ubjdAKMjT2sT9XYb2enJym1MRVMsvEC6L5bo0y9oILwa9j+yqN2X5cqw9VMC7pgvFMZvCDdKtOAc8fCKOMEbn05Y11oIu1MNXbKOOyxS7NAAAA==',
  hydrangea:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Blue%20hydrangea%20flower%20close%20up.jpg',
  rosemary:'data:image/webp;base64,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'
});

const root = document.querySelector('#upcoming-review-root');
let exactCalendarDataPromise = null;
let exactListDataPromise = null;

function getExactCalendarDataUrl(){
  if(!exactCalendarDataPromise){
    exactCalendarDataPromise = Promise.all(
      [0,1,2,3,4].map((i)=>fetch(`./assets/upcoming-calendar-exact/part${i}.txt?v=20261003-exact`).then((r)=>{
        if(!r.ok) throw new Error('calendar_exact_asset_missing_'+i);
        return r.text();
      }))
    ).then((parts)=>'data:image/webp;base64,'+parts.join(''));
  }
  return exactCalendarDataPromise;
}

function getExactListDataUrl(){
  if(!exactListDataPromise){
    exactListDataPromise = Promise.all(
      Array.from({length:12},(_,i)=>i).map((i)=>fetch(`./assets/upcoming-list-exact-v2/part${String(i).padStart(2,'0')}.txt?v=20261003-exact-v2`).then((r)=>{
        if(!r.ok) throw new Error('list_exact_asset_missing_'+i);
        return r.text();
      }).then((t)=>t.trim()))
    ).then((parts)=>'data:image/webp;base64,'+parts.join(''));
  }
  return exactListDataPromise;
}

async function renderExactCalendar(){
  document.body.classList.remove('is-exact-list');
  document.body.classList.add('is-exact-calendar');
  const src=await getExactCalendarDataUrl();
  root.innerHTML=`
    <div class="upcoming-exact-calendar" aria-label="Upcoming Calendar approved visual">
      <img src="${src}" alt="Upcoming Calendar" draggable="false">
      <button type="button" class="exact-hotspot exact-back" data-upcoming-action="back" aria-label="Back to List"></button>
      <button type="button" class="exact-hotspot exact-list" data-upcoming-view="list" aria-label="List view"></button>
      <button type="button" class="exact-hotspot exact-add-task" data-upcoming-action="add-task" aria-label="Add task"></button>
      <a class="exact-hotspot exact-nav-home" href="./index.html" aria-label="Home"></a>
      <a class="exact-hotspot exact-nav-mygarden" href="./index.html" aria-label="My Garden"></a>
      <a class="exact-hotspot exact-nav-add" href="./approved/add-plant-approved.html" aria-label="Add Plant"></a>
      <a class="exact-hotspot exact-nav-design" href="/modules/garden-design/" aria-label="Design"></a>
      <a class="exact-hotspot exact-nav-shop" href="/store/" aria-label="Shop"></a>
    </div>`;
}

async function renderExactList(){
  document.body.classList.remove('is-exact-calendar');
  document.body.classList.add('is-exact-list');
  const src=await getExactListDataUrl();
  root.innerHTML=`
    <div class="upcoming-exact-list" aria-label="Upcoming List approved visual">
      <div class="upcoming-exact-list-stage">
        <img src="${src}" alt="Upcoming List" draggable="false">
        <button type="button" class="exact-hotspot exact-calendar" data-upcoming-view="calendar" aria-label="Calendar view"></button>
        <button type="button" class="exact-hotspot exact-list-add-task" data-upcoming-action="add-task" aria-label="Add task"></button>
        <a class="exact-hotspot exact-nav-home" href="./index.html" aria-label="Home"></a>
        <a class="exact-hotspot exact-nav-mygarden" href="./index.html" aria-label="My Garden"></a>
        <a class="exact-hotspot exact-nav-add" href="./approved/add-plant-approved.html" aria-label="Add Plant"></a>
        <a class="exact-hotspot exact-nav-design" href="/modules/garden-design/" aria-label="Design"></a>
        <a class="exact-hotspot exact-nav-shop" href="/store/" aria-label="Shop"></a>
      </div>
    </div>`;
}

const state = {
  view: location.hash === '#calendar' ? 'calendar' : 'list',
  filter:'to_do',
  selectedMonth:'2026-10',
  selectedDate:'2026-10-02',
};

async function render(){
  if(state.view === 'calendar'){
    await renderExactCalendar();
  } else {
    await renderExactList();
  }
}

root.addEventListener('click',(event)=>{
  const viewButton=event.target.closest('[data-upcoming-view]');
  if(viewButton){
    state.view=viewButton.dataset.upcomingView;
    location.hash=state.view==='calendar'?'calendar':'list';
    render();
    return;
  }

  const filterButton=event.target.closest('[data-upcoming-filter]');
  if(filterButton){
    state.filter=filterButton.dataset.upcomingFilter;
    render();
    return;
  }

  const dayButton=event.target.closest('[data-upcoming-date]');
  if(dayButton){
    state.selectedDate=dayButton.dataset.upcomingDate;
    render();
    return;
  }

  if(event.target.closest('[data-upcoming-action="back"]')){
    state.view='list';
    location.hash='list';
    render();
  }
});

window.addEventListener('hashchange',()=>{
  state.view=location.hash==='#calendar'?'calendar':'list';
  render();
});

render();
