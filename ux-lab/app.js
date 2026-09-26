const modules = [
  {
    id:'garden',
    name:'My Garden',
    icon:'❀',
    micro:'14 plants · 2 need attention',
    title:'Your garden is thriving',
    subtitle:'See everything CRUVIT knows about your garden.',
    action:'Open my garden',
    image:'/homepage-v1/assets/my-garden-desktop.png'
  },
  {
    id:'doctor',
    name:'Plant Doctor',
    icon:'♡',
    micro:'2 plants need attention',
    title:'Diagnose what is happening',
    subtitle:'Visual symptoms + plant identity + climate + recent care.',
    action:'Check a plant',
    image:'/homepage-v1/assets/privacy-botanical.jpg'
  },
  {
    id:'design',
    name:'Garden Design',
    icon:'◫',
    micro:'1 design in progress',
    title:'Continue your garden design',
    subtitle:'Place real plants, scale them correctly and blend them naturally.',
    action:'Continue design',
    image:'/homepage-v1/assets/sanctuary-cta.jpg'
  },
  {
    id:'identify',
    name:'Plant ID',
    icon:'⌗',
    micro:'Scan & add to your garden',
    title:'Identify a plant instantly',
    subtitle:'Recognition becomes useful when it joins your living garden.',
    action:'Identify plant',
    image:'/homepage-v1/assets/store-plant-care.jpg'
  },
  {
    id:'recommendations',
    name:'Recommendations',
    icon:'✧',
    micro:'3 strong matches today',
    title:'What makes sense here?',
    subtitle:'Plants and actions matched to your conditions and goals.',
    action:'See recommendations',
    image:'/homepage-v1/assets/store-kits.jpg'
  },
  {
    id:'shop',
    name:'Shop',
    icon:'◇',
    micro:'12 items matched to your garden',
    title:'Only what may actually help',
    subtitle:'Products selected with your garden context in mind.',
    action:'Browse matched items',
    image:'/homepage-v1/assets/store-watering.jpg'
  }
];

let active = 0;
let pointerStartX = null;
const stage = document.getElementById('carouselStage');
const index = document.getElementById('moduleIndex');
const toast = document.getElementById('toast');

function circularDistance(i, activeIndex){
  let d = i - activeIndex;
  const n = modules.length;
  if(d > n/2) d -= n;
  if(d < -n/2) d += n;
  return d;
}
function roleForDistance(d){
  if(d===0) return 'is-center';
  if(d===-1) return 'is-left';
  if(d===1) return 'is-right';
  if(d===-2) return 'is-far-left';
  if(d===2) return 'is-far-right';
  return 'is-back';
}
function cardMarkup(m, i){
  const d = circularDistance(i, active);
  return `<button class="module-card ${roleForDistance(d)}" data-index="${i}" aria-label="${m.name}">
    <img src="${m.image}" alt="">
    <span class="card-layer"></span>
    <span class="card-copy">
      <span class="card-topline">
        <span class="card-icon">${m.icon}</span>
        <span class="card-micro">${m.micro}</span>
      </span>
      <h2>${m.name}</h2>
      <p>${m.title}</p>
      <span class="card-action">${m.action} <span>›</span></span>
    </span>
  </button>`;
}
function render(){
  stage.innerHTML = modules.map(cardMarkup).join('');
  index.innerHTML = modules.map((m,i)=>`<button class="index-button ${i===active?'active':''}" data-index="${i}" aria-label="${m.name}" title="${m.name}">${m.icon}</button>`).join('');
  document.body.dataset.activeModule = modules[active].id;
}
function setActive(i){
  active = (i + modules.length) % modules.length;
  render();
}
function nudge(dir){ setActive(active + dir); }
function flash(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(flash.t);
  flash.t=setTimeout(()=>toast.classList.remove('show'),1800);
}

stage.addEventListener('click',e=>{
  const card=e.target.closest('.module-card');
  if(!card) return;
  const i=Number(card.dataset.index);
  if(i!==active){setActive(i);return;}
  const m=modules[i];
  if(m.id==='garden') flash('My Garden opens the full living dashboard.');
  else if(m.id==='doctor') flash('Plant Doctor opens directly — no detour through My Garden.');
  else if(m.id==='design') flash('Garden Design opens directly on the current design.');
  else if(m.id==='identify') flash('Plant ID opens the camera flow.');
  else if(m.id==='recommendations') flash('Recommendations opens with garden context already applied.');
  else flash('Shop opens with garden-matched products.');
});

index.addEventListener('click',e=>{
  const btn=e.target.closest('.index-button');
  if(btn) setActive(Number(btn.dataset.index));
});

stage.addEventListener('pointerdown',e=>{ pointerStartX=e.clientX; stage.setPointerCapture?.(e.pointerId); });
stage.addEventListener('pointerup',e=>{
  if(pointerStartX===null) return;
  const delta=e.clientX-pointerStartX;
  if(Math.abs(delta)>42) nudge(delta<0?1:-1);
  pointerStartX=null;
});
stage.addEventListener('pointercancel',()=>{pointerStartX=null});
stage.addEventListener('wheel',e=>{
  if(Math.abs(e.deltaX)>Math.abs(e.deltaY) && Math.abs(e.deltaX)>18){
    e.preventDefault();
    nudge(e.deltaX>0?1:-1);
  }
},{passive:false});

document.querySelectorAll('[data-toast]').forEach(btn=>btn.addEventListener('click',()=>flash(btn.dataset.toast)));
document.getElementById('focusBar').addEventListener('click',()=>flash('Priority: check the lemon leaves, then water the herb corner.'));
document.querySelectorAll('.hotspot').forEach(h=>{
  h.addEventListener('click',()=>{
    document.querySelectorAll('.hotspot').forEach(x=>x.classList.remove('open'));
    h.classList.add('open');
    flash(`${h.dataset.hotspot}: tap again in the final product to open plant detail.`);
  });
  h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();h.click();}});
});

window.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight') nudge(1);
  if(e.key==='ArrowLeft') nudge(-1);
});

render();