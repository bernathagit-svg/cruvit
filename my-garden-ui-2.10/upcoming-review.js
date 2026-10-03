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
  { id:'t-pests', garden_plant_id:'hydrangea', title:'Check for pests', task_type:'inspect', due_on:'2026-10-02', done:false },
  { id:'t-harvest', garden_plant_id:'rosemary', title:'Harvest', task_type:'harvest', due_on:'2026-10-02', done:false },
  { id:'t-prune', garden_plant_id:'lavender', title:'Prune', task_type:'pruning', due_on:'2026-10-03', done:false },
  { id:'t-feed', garden_plant_id:'agave', title:'Fertilize', task_type:'fertilizing', due_on:'2026-10-05', done:false },
  { id:'t-done-1', garden_plant_id:'olive', title:'Water', task_type:'watering', due_on:'2026-10-01', done:true },
  { id:'t-done-2', garden_plant_id:'rose', title:'Deadhead', task_type:'pruning', due_on:'2026-09-30', done:true },
]);

const plantVisuals = Object.freeze({
  lemon:'https://upload.wikimedia.org/wikipedia/commons/7/78/Citrus_%C3%97_limon_-_Eureka_-_Fruits.jpg',
  lavender:'https://upload.wikimedia.org/wikipedia/commons/c/c4/Vanessa_cardui_on_Lavandula_angustifolia-2459.jpg',
  agave:'/modules/garden-design/images/succulents.png',
  hydrangea:'https://upload.wikimedia.org/wikipedia/commons/f/f4/Hortensia-1.jpg',
  rosemary:'https://upload.wikimedia.org/wikipedia/commons/c/c8/Starr_070402-6273_Rosmarinus_officinalis.jpg',
});

const root = document.querySelector('#upcoming-review-root');
const state = {
  view: location.hash === '#calendar' ? 'calendar' : 'list',
  filter:'to_do',
  selectedMonth:'2026-10',
  selectedDate:'2026-10-02',
};

function render(){
  if(state.view === 'calendar'){
    const vm = buildUpcomingCalendarScreenViewModel({
      plants,
      tasks,
      filter:state.filter,
      selectedMonth:state.selectedMonth,
      selectedDate:state.selectedDate,
    });
    root.innerHTML = renderUpcomingCalendarScreen(vm,{ plantVisuals, activePlantCount:plants.length });
  } else {
    const vm = buildUpcomingListScreenViewModel({
      plants,
      tasks,
      filter:state.filter,
    });
    root.innerHTML = renderUpcomingListScreen(vm,{
      plantVisuals,
      activePlantCount:plants.length,
      selectedDate:'2026-10-02',
    });
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
