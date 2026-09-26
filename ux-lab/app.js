const surface=document.getElementById('dragSurface');
const home=document.getElementById('approvedHome');
const a=document.querySelector('.layer-a');
const b=document.querySelector('.layer-b');

let index=0;
let startX=0;
let currentX=0;
let dragging=false;

const w=()=>home.getBoundingClientRect().width;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

function render(dx=0, snap=false){
  const width=w();
  const p=clamp(dx/width,-1,1);

  a.classList.toggle('snap',snap);
  b.classList.toggle('snap',snap);

  if(index===0){
    a.style.transform=`translateX(${dx}px) scale(${1-0.035*Math.abs(p)})`;
    b.style.transform=`translateX(${width+dx}px) scale(${0.965+0.035*Math.abs(p)})`;
    a.style.filter=`brightness(${1-0.05*Math.abs(p)})`;
    b.style.filter=`brightness(${0.96+0.04*Math.abs(p)})`;
  } else {
    a.style.transform=`translateX(${-width+dx}px) scale(${0.965+0.035*Math.abs(p)})`;
    b.style.transform=`translateX(${dx}px) scale(${1-0.035*Math.abs(p)})`;
    a.style.filter=`brightness(${0.96+0.04*Math.abs(p)})`;
    b.style.filter=`brightness(${1-0.05*Math.abs(p)})`;
  }
}

function begin(x){
  dragging=true;
  startX=x;
  currentX=x;
  surface.classList.add('dragging');
  a.classList.remove('snap');
  b.classList.remove('snap');
}

function move(x){
  if(!dragging)return;
  currentX=x;
  let dx=currentX-startX;
  if(index===0 && dx>0) dx*=0.18;
  if(index===1 && dx<0) dx*=0.18;
  render(dx,false);
}

function finish(){
  if(!dragging)return;
  let dx=currentX-startX;
  const threshold=Math.max(52,w()*0.11);

  if(index===0 && dx<=-threshold){
    index=1;
    render(0,true);
  }else if(index===1 && dx>=threshold){
    index=0;
    render(0,true);
  }else{
    render(0,true);
  }

  dragging=false;
  surface.classList.remove('dragging');
}

surface.addEventListener('pointerdown',e=>{
  begin(e.clientX);
  surface.setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
surface.addEventListener('pointermove',e=>{move(e.clientX); if(dragging)e.preventDefault();});
surface.addEventListener('pointerup',e=>{move(e.clientX); finish(); e.preventDefault();});
surface.addEventListener('pointercancel',finish);

surface.addEventListener('touchstart',e=>{
  if(e.touches[0]) begin(e.touches[0].clientX);
},{passive:false});
surface.addEventListener('touchmove',e=>{
  if(e.touches[0]) move(e.touches[0].clientX);
  e.preventDefault();
},{passive:false});
surface.addEventListener('touchend',finish,{passive:false});

window.addEventListener('resize',()=>render(0,false));
render(0,false);