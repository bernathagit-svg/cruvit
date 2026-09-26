const baseScreen=document.getElementById('baseScreen');
const stage=document.getElementById('carouselStage');
const surface=document.getElementById('dragSurface');
const home=document.getElementById('home');
const design=document.getElementById('cardDesign');
const garden=document.getElementById('cardGarden');
const doctor=document.getElementById('cardDoctor');

let index=0;
let dragging=false;
let startX=0;
let currentX=0;
let progress=0;

const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const poses={
  design:[
    {l:0,t:12.9,w:30.0,h:73.8},
    {l:29.2,t:4.2,w:43.2,h:88.0}
  ],
  garden:[
    {l:26.3,t:0.1,w:46.0,h:95.1},
    {l:0,t:15.0,w:27.4,h:70.2}
  ],
  doctor:[
    {l:73.0,t:14.3,w:27.0,h:72.0},
    {l:72.7,t:16.0,w:27.3,h:69.4}
  ]
};

function apply(card,pair,t){
  const a=pair[0], b=pair[1];
  card.style.left=lerp(a.l,b.l,t)+'%';
  card.style.top=lerp(a.t,b.t,t)+'%';
  card.style.width=lerp(a.w,b.w,t)+'%';
  card.style.height=lerp(a.h,b.h,t)+'%';
  const imgs=card.querySelectorAll('.variant');
  imgs[0].style.opacity=String(1-t);
  imgs[1].style.opacity=String(t);
}

function render(t){
  progress=clamp(t,0,1);
  apply(design,poses.design,progress);
  apply(garden,poses.garden,progress);
  apply(doctor,poses.doctor,progress);

  const depth=0.015*Math.sin(progress*Math.PI);
  design.style.transform='scale('+(1+depth)+')';
  garden.style.transform='scale('+(1-depth*0.8)+')';
  doctor.style.transform='scale('+(1-depth*0.2)+')';
}

function activate(){
  stage.classList.add('active');
  stage.setAttribute('aria-hidden','false');
  render(index);
}

function settleVisible(){
  stage.classList.add('active');
  stage.setAttribute('aria-hidden','false');
  render(index);
}

function begin(x){
  dragging=true;
  startX=x;
  currentX=x;
  surface.classList.add('dragging');
  activate();
}

function move(x){
  if(!dragging)return;
  currentX=x;
  const dx=currentX-startX;
  const w=home.getBoundingClientRect().width;
  let t=index===0 ? (-dx/w) : (1-dx/w);
  t=clamp(t,0,1);
  render(t);
}

function animateTo(target){
  const from=progress;
  const start=performance.now();
  const dur=260;
  function frame(now){
    const u=clamp((now-start)/dur,0,1);
    const eased=1-Math.pow(1-u,3);
    render(lerp(from,target,eased));
    if(u<1) requestAnimationFrame(frame);
    else{
      index=target===1?1:0;
      settleVisible();
    }
  }
  requestAnimationFrame(frame);
}

function finish(){
  if(!dragging)return;
  dragging=false;
  surface.classList.remove('dragging');
  animateTo(progress>=0.5?1:0);
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

render(0);