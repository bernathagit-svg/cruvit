const baseScreen=document.getElementById('baseScreen');
const stage=document.getElementById('carouselStage');
const surface=document.getElementById('dragSurface');
const home=document.getElementById('home');
const design=document.getElementById('cardDesign');
const garden=document.getElementById('cardGarden');
const doctor=document.getElementById('cardDoctor');
const plantId=document.getElementById('cardPlantId');
const smart=document.getElementById('cardSmart');
const shop=document.getElementById('cardShop');

const cards=[design,garden,doctor,plantId,smart,shop];
const keys=['design','garden','doctor','plantId','smart','shop'];
cards.forEach((card,i)=>{const v=document.createElement('video');v.src=card.dataset.motion;v.muted=true;v.playsInline=true;v.preload='metadata';card.dataset.ratio=i===1?'720/1280':'834/1112';card.appendChild(v);card._motion=v;if(card.dataset.breakoutImage){const b=document.createElement('img');b.src=card.dataset.breakoutImage;b.className='breakout-image';b.alt='';card.appendChild(b);card._breakoutImage=b;}});
function playCenterMotion(){cards.forEach((card,i)=>{const v=card._motion;if(!v)return;v.pause();if(i!==index){try{v.currentTime=0}catch{}}});const v=cards[index]?._motion;if(v){try{v.currentTime=0}catch{};v.play().catch(()=>{});}}

let index=1;
let dragging=false;
let startX=0;
let currentX=0;
let progress=0;
let fromIndex=1;
let toIndex=1;

const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const POSES={
  left:{l:-10.5,t:11.4,w:34,h:82.5,o:1,a:7},
  center:{l:24,t:1.7,w:52,h:95.9,o:1,a:0},
  right:{l:76.7,t:11.4,w:34,h:82.5,o:1,a:-7},
  offLeft:{l:-45,t:13,w:29,h:72,o:0,a:7},
  offRight:{l:116,t:13,w:29,h:72,o:0,a:-7}
};

function poseFor(cardIndex,centerIndex){
  const d=cardIndex-centerIndex;
  if(d===0)return POSES.center;
  if(d===-1)return POSES.left;
  if(d===1)return POSES.right;
  return d<0?POSES.offLeft:POSES.offRight;
}

const states=keys.map((_,centerIndex)=>{
  const state={};
  keys.forEach((key,cardIndex)=>{
    state[key]=poseFor(cardIndex,centerIndex);
  });
  return state;
});

function apply(card,a,b,t){
  const w=lerp(a.w,b.w,t);
  const h=lerp(a.h,b.h,t);
  card.style.left=lerp(a.l,b.l,t)+'%';
  card.style.top=lerp(a.t,b.t,t)+'%';
  card.style.width=w+'%';
  card.style.height=h+'%';
  card.style.aspectRatio='auto';
  card.style.opacity=String(lerp(a.o,b.o,t));
  const angle=lerp(a.a,b.a,t);
  card.style.transform='perspective(1200px) rotateY('+angle+'deg)';
  card.style.zIndex=String(Math.round(w));
}

function renderBetween(aIndex,bIndex,t){
  progress=clamp(t,0,1);
  const a=states[aIndex];
  const b=states[bIndex];

  cards.forEach((card,i)=>{
    apply(card,a[keys[i]],b[keys[i]],progress);
  });

  const designVariants=design.querySelectorAll('.variant');
  const designCenterFrom=aIndex===0?1:0;
  const designCenterTo=bIndex===0?1:0;
  const designCenterMix=lerp(designCenterFrom,designCenterTo,progress);
  if(designVariants[0])designVariants[0].style.opacity=String(1-designCenterMix);
  if(designVariants[1])designVariants[1].style.opacity=String(designCenterMix);
  if(design._motion)design._motion.style.opacity=String(designCenterMix);

  const gardenVariants=garden.querySelectorAll('.variant');
  const gardenCenterFrom=aIndex===1?1:0;
  const gardenCenterTo=bIndex===1?1:0;
  const gardenCenterMix=lerp(gardenCenterFrom,gardenCenterTo,progress);
  if(gardenVariants[0])gardenVariants[0].style.opacity=String(gardenCenterMix);
  if(gardenVariants[1])gardenVariants[1].style.opacity=String(1-gardenCenterMix);
  if(garden._motion)garden._motion.style.opacity=String(gardenCenterMix);
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
      if(commit)index=toIndex;
      renderState(index);
      if(commit)setTimeout(playCenterMotion,80);
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
  if(e.touches[0])begin(e.touches[0].clientX);
},{passive:false});
surface.addEventListener('touchmove',e=>{
  if(e.touches[0])move(e.touches[0].clientX);
  e.preventDefault();
},{passive:false});
surface.addEventListener('touchend',finish,{passive:false});

renderState(index);
setTimeout(playCenterMotion,700);
