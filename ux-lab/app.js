const baseScreen=document.getElementById('baseScreen');
const stage=document.getElementById('carouselStage');
const surface=document.getElementById('dragSurface');
const home=document.getElementById('home');
const design=document.getElementById('cardDesign');
const garden=document.getElementById('cardGarden');
const doctor=document.getElementById('cardDoctor');
const plantId=document.getElementById('cardPlantId');
const smart=document.getElementById('cardSmart');

let index=0;
let dragging=false;
let startX=0;
let currentX=0;
let progress=0;
let fromIndex=0;
let toIndex=0;

const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const states=[
  {
    design:{l:0,t:12.9,w:30.0,h:73.8,o:1},
    garden:{l:26.3,t:0.1,w:46.0,h:95.1,o:1},
    doctor:{l:73.0,t:14.3,w:27.0,h:72.0,o:1},
    plantId:{l:108,t:16,w:27.3,h:69.4,o:0},
    smart:{l:140,t:16,w:27.3,h:69.4,o:0}
  },
  {
    design:{l:29.2,t:4.2,w:43.2,h:88.0,o:1},
    garden:{l:0,t:15.0,w:27.4,h:70.2,o:1},
    doctor:{l:72.7,t:16.0,w:27.3,h:69.4,o:1},
    plantId:{l:108,t:16,w:27.3,h:69.4,o:0},
    smart:{l:140,t:16,w:27.3,h:69.4,o:0}
  },
  {
    design:{l:0,t:15.0,w:27.4,h:70.2,o:1},
    garden:{l:-31,t:16,w:27.4,h:70.2,o:0},
    doctor:{l:72.7,t:16.0,w:27.3,h:69.4,o:1},
    plantId:{l:29.2,t:4.2,w:43.2,h:88.0,o:1},
    smart:{l:108,t:16,w:27.3,h:69.4,o:0}
  },
  {
    design:{l:-31,t:16,w:27.4,h:70.2,o:0},
    garden:{l:-63,t:16,w:27.4,h:70.2,o:0},
    doctor:{l:0,t:16,w:27.3,h:69.4,o:1},
    plantId:{l:72.7,t:16,w:27.3,h:69.4,o:1},
    smart:{l:29.2,t:4.2,w:43.2,h:88.0,o:1}
  }
];

function apply(card,a,b,t){
  card.style.left=lerp(a.l,b.l,t)+'%';
  card.style.top=lerp(a.t,b.t,t)+'%';
  card.style.width=lerp(a.w,b.w,t)+'%';
  card.style.height=lerp(a.h,b.h,t)+'%';
  card.style.opacity=String(lerp(a.o,b.o,t));
}

function renderBetween(aIndex,bIndex,t){
  progress=clamp(t,0,1);
  const a=states[aIndex], b=states[bIndex];
  apply(design,a.design,b.design,progress);

  const designVariants=design.querySelectorAll('.variant');
  const designCenterFrom=aIndex===1?1:0;
  const designCenterTo=bIndex===1?1:0;
  const designCenterMix=lerp(designCenterFrom,designCenterTo,progress);
  if(designVariants[0])designVariants[0].style.opacity=String(1-designCenterMix);
  if(designVariants[1])designVariants[1].style.opacity=String(designCenterMix);
  apply(garden,a.garden,b.garden,progress);
  apply(doctor,a.doctor,b.doctor,progress);
  apply(plantId,a.plantId,b.plantId,progress);
  apply(smart,a.smart,b.smart,progress);

  const depth=0.015*Math.sin(progress*Math.PI);
  design.style.transform='scale('+(1+depth*0.5)+')';
  garden.style.transform='scale('+(1-depth*0.5)+')';
  doctor.style.transform='scale('+(1-depth*0.2)+')';
  plantId.style.transform='scale('+(1+depth*0.6)+')';
  smart.style.transform='scale('+(1+depth)+')';
}

function renderState(i){
  renderBetween(i,i,0);
}

function activate(){
  stage.classList.add('active');
  stage.setAttribute('aria-hidden','false');
  renderState(index);
}

function begin(x){
  dragging=true;
  startX=x;
  currentX=x;
  fromIndex=index;
  toIndex=index;
  progress=0;
  surface.classList.add('dragging');
  activate();
}

function move(x){
  if(!dragging)return;
  currentX=x;
  const dx=currentX-startX;
  const w=home.getBoundingClientRect().width;
  if(dx<0 && index<states.length-1){
    toIndex=index+1;
  }else if(dx>0 && index>0){
    toIndex=index-1;
  }else{
    toIndex=index;
  }
  const t=toIndex===index?0:clamp(Math.abs(dx)/w,0,1);
  renderBetween(index,toIndex,t);
}

function animateTo(commit){
  const startProgress=progress;
  const target=commit?1:0;
  const start=performance.now();
  const dur=260;
  function frame(now){
    const u=clamp((now-start)/dur,0,1);
    const eased=1-Math.pow(1-u,3);
    renderBetween(fromIndex,toIndex,lerp(startProgress,target,eased));
    if(u<1){
      requestAnimationFrame(frame);
    }else{
      if(commit) index=toIndex;
      renderState(index);
      stage.classList.add('active');
      stage.setAttribute('aria-hidden','false');
    }
  }
  requestAnimationFrame(frame);
}

function finish(){
  if(!dragging)return;
  dragging=false;
  surface.classList.remove('dragging');
  const canMove=toIndex!==index;
  animateTo(canMove && progress>=0.5);
}

surface.addEventListener('pointerdown',e=>{
  begin(e.clientX);
  surface.setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
surface.addEventListener('pointermove',e=>{
  move(e.clientX);
  if(dragging)e.preventDefault();
});
surface.addEventListener('pointerup',e=>{
  move(e.clientX);
  finish();
  e.preventDefault();
});
surface.addEventListener('pointercancel',finish);

surface.addEventListener('touchstart',e=>{
  if(e.touches[0]) begin(e.touches[0].clientX);
},{passive:false});
surface.addEventListener('touchmove',e=>{
  if(e.touches[0]) move(e.touches[0].clientX);
  e.preventDefault();
},{passive:false});
surface.addEventListener('touchend',finish,{passive:false});

renderState(0);
