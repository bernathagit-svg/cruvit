const stage=document.getElementById('carouselStage');
const surface=document.getElementById('dragSurface');
const home=document.getElementById('home');

const cards={
  design:document.getElementById('cardDesign'),
  garden:document.getElementById('cardGarden'),
  doctor:document.getElementById('cardDoctor'),
  smart:document.getElementById('cardSmart'),
  shop:document.getElementById('cardShop'),
  plantId:document.getElementById('cardPlantId')
};

const MODULE_COUNT=6;
let index=0;
let dragging=false;
let startX=0;
let progress=0;
let targetIndex=0;

const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=i=>(i+MODULE_COUNT)%MODULE_COUNT;

const hiddenLeft={l:-34,t:18,w:25,h:66,o:0,z:0,asset:'single'};
const hiddenRight={l:109,t:18,w:25,h:66,o:0,z:0,asset:'single'};
const sideLeft={l:0,t:14.8,w:27.4,h:70.2,o:1,z:2,asset:'single'};
const sideRight={l:72.7,t:15.8,w:27.3,h:69.4,o:1,z:2,asset:'single'};
const center={l:29.2,t:4.2,w:43.2,h:88,o:1,z:4,asset:'center'};

/*
  State 0 and State 1 intentionally preserve the exact approved three-card
  geometry from the working checkpoint. States 2-5 extend the same stage to
  the three newly approved module assets without changing Home itself.
*/
const states=[
  {
    design:{l:0,t:12.9,w:30,h:73.8,o:1,z:2,asset:'side-primary'},
    garden:{l:26.3,t:.1,w:46,h:95.1,o:1,z:4,asset:'center'},
    doctor:{l:73,t:14.3,w:27,h:72,o:1,z:2,asset:'side-primary'},
    smart:{...hiddenLeft},shop:{...hiddenLeft},plantId:{...hiddenRight}
  },
  {
    design:{l:29.2,t:4.2,w:43.2,h:88,o:1,z:4,asset:'center'},
    garden:{l:0,t:15,w:27.4,h:70.2,o:1,z:2,asset:'side-primary'},
    doctor:{l:72.7,t:16,w:27.3,h:69.4,o:1,z:2,asset:'side-alt'},
    smart:{...hiddenLeft},shop:{...hiddenLeft},plantId:{...hiddenRight}
  },
  {
    design:{...sideRight,asset:'center'},
    garden:{...hiddenRight},
    doctor:{...hiddenRight},
    smart:{...center},
    shop:{...sideLeft},
    plantId:{...hiddenLeft}
  },
  {
    design:{...hiddenRight},
    garden:{...hiddenRight},
    doctor:{...hiddenLeft},
    smart:{...sideRight},
    shop:{...center},
    plantId:{...sideLeft}
  },
  {
    design:{...hiddenLeft},
    garden:{...hiddenRight},
    doctor:{...sideLeft,asset:'center'},
    smart:{...hiddenRight},
    shop:{...sideRight},
    plantId:{...center}
  },
  {
    design:{...sideLeft,asset:'side-primary'},
    garden:{...sideLeft,asset:'side-primary'},
    doctor:{...center,asset:'center'},
    smart:{...hiddenRight},
    shop:{...hiddenRight},
    plantId:{...sideRight}
  }
];

function setAsset(card,mode,mixMode=null,mix=0){
  const imgs=[...card.querySelectorAll('.asset')];
  if(!imgs.length)return;

  const classFor=m=>{
    if(m==='center')return 'asset-center';
    if(m==='side-alt')return 'asset-side-alt';
    if(m==='side-primary')return 'asset-side-primary';
    return 'asset-single';
  };

  const fromClass=classFor(mode);
  const toClass=classFor(mixMode||mode);

  imgs.forEach(img=>{img.style.opacity='0'});
  let from=card.querySelector('.'+fromClass) || card.querySelector('.asset-single') || card.querySelector('.asset-center') || imgs[0];
  let to=card.querySelector('.'+toClass) || card.querySelector('.asset-single') || card.querySelector('.asset-center') || from;

  if(from===to){
    from.style.opacity='1';
  }else{
    from.style.opacity=String(1-mix);
    to.style.opacity=String(mix);
  }
}

function applyPose(name,a,b,t){
  const card=cards[name];
  card.style.left=lerp(a.l,b.l,t)+'%';
  card.style.top=lerp(a.t,b.t,t)+'%';
  card.style.width=lerp(a.w,b.w,t)+'%';
  card.style.height=lerp(a.h,b.h,t)+'%';
  card.style.opacity=String(lerp(a.o,b.o,t));
  card.style.zIndex=String(t<.5?a.z:b.z);

  const depth=.015*Math.sin(t*Math.PI);
  const centerWeight=Math.max(a.z,b.z)>=4?1:.25;
  card.style.transform='scale('+(1+depth*centerWeight)+')';
  setAsset(card,a.asset,b.asset,t);
}

function renderBetween(fromIndex,toIndex,t){
  progress=clamp(t,0,1);
  const from=states[wrap(fromIndex)];
  const to=states[wrap(toIndex)];
  Object.keys(cards).forEach(name=>applyPose(name,from[name],to[name],progress));
}

function renderState(stateIndex){
  const s=states[wrap(stateIndex)];
  Object.keys(cards).forEach(name=>applyPose(name,s[name],s[name],0));
  progress=0;
}

function activate(){
  stage.classList.add('active');
  stage.setAttribute('aria-hidden','false');
  renderState(index);
}

function begin(x){
  if(dragging)return;
  dragging=true;
  startX=x;
  progress=0;
  targetIndex=index;
  surface.classList.add('dragging');
  activate();
}

function move(x){
  if(!dragging)return;
  const dx=x-startX;
  const w=Math.max(1,home.getBoundingClientRect().width);
  const amount=clamp(Math.abs(dx)/w,0,1);
  targetIndex=dx<0?wrap(index+1):wrap(index-1);
  renderBetween(index,targetIndex,amount);
}

function animateTo(commit){
  const from=progress;
  const final=commit?1:0;
  const fromIndex=index;
  const toIndex=targetIndex;
  const start=performance.now();
  const dur=260;

  function frame(now){
    const u=clamp((now-start)/dur,0,1);
    const eased=1-Math.pow(1-u,3);
    renderBetween(fromIndex,toIndex,lerp(from,final,eased));
    if(u<1){
      requestAnimationFrame(frame);
    }else{
      if(commit)index=toIndex;
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
  animateTo(progress>=.5);
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
  if(!dragging&&e.touches[0])begin(e.touches[0].clientX);
},{passive:false});
surface.addEventListener('touchmove',e=>{
  if(e.touches[0])move(e.touches[0].clientX);
  if(dragging)e.preventDefault();
},{passive:false});
surface.addEventListener('touchend',finish,{passive:false});

renderState(0);
