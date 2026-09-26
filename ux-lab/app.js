const screens=[...document.querySelectorAll('.screen')];
const toast=document.getElementById('toast');
let historyStack=['home'];

function showScreen(name,push=true){
  const target=document.querySelector('[data-screen="'+name+'"]');
  if(!target)return;
  screens.forEach(s=>s.classList.toggle('active',s===target));
  if(push && historyStack.at(-1)!==name) historyStack.push(name);
}
function back(){
  if(historyStack.length>1)historyStack.pop();
  showScreen(historyStack.at(-1)||'home',false);
}
function flash(msg){
  toast.textContent=msg;toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'),1800);
}
document.addEventListener('click',e=>{
  const btn=e.target.closest('button'); if(!btn)return;
  const action=btn.dataset.action;
  const module=btn.dataset.module;
  const nav=btn.dataset.nav;
  const area=btn.dataset.area;
  if(action==='open-hub')showScreen('hub');
  if(action==='close-hub'||action==='back-home'){historyStack=['home'];showScreen('home',false)}
  if(action==='back-hub')showScreen('hub');
  if(action==='open-garden')showScreen('garden');
  if(action==='open-profile')showScreen('profile');
  if(action==='open-today')flash('Today: Water herbs · Check lemon leaves');
  if(action==='notifications')flash('No urgent alerts. Your garden is calm.');
  if(action==='ask')flash('Ask CRUVIT will become the universal garden command.');
  if(action==='identify-demo')flash('Scanning… identity + climate + garden context');
  if(module)showScreen(module==='garden'?'garden':module);
  if(nav)showScreen(nav==='home'?'home':nav);
  if(area){flash(area+' · opening living area view');setTimeout(()=>showScreen('garden'),450)}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')back()});
window.addEventListener('popstate',back);
