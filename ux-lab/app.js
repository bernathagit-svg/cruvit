const modules=[
  {id:"design",name:"Garden Design",subtitle:"Design your dream garden with your phone."},
  {id:"garden",name:"My Garden",subtitle:"Track, care and grow your garden."},
  {id:"doctor",name:"Plant Doctor",subtitle:"Detect problems and get solutions."},
  {id:"identify",name:"Plant ID",subtitle:"Identify any plant instantly."},
  {id:"recommendations",name:"Smart Recommendations",subtitle:"Find the right plants for your space."},
  {id:"shop",name:"Shop",subtitle:"Plants, tools and more for your garden."}
];

let active=1,startX=null;
const carousel=document.getElementById("carousel");
const dots=document.getElementById("dots");

const visual={
design:()=>`
<div class="visual approved-design">
  <div class="plant-rail">
    <span style="--img:url('/homepage-v1/assets/my-garden-snapshot.png')"></span>
    <span class="rail-cypress"></span>
    <span class="rail-flower"></span>
    <span class="rail-lavender"></span>
    <span class="rail-agave"></span>
  </div>
  <div class="phone-shell">
    <div class="phone-notch"></div>
    <div class="phone-screen"></div>
    <div class="placement-box"></div>
    <div class="finger"></div>
  </div>
</div>`,
garden:()=>`
<div class="visual approved-garden">
  <div class="garden-tree">
    <div class="trunk"></div>
    <div class="crown c1"></div><div class="crown c2"></div><div class="crown c3"></div>
    <div class="crown c4"></div><div class="crown c5"></div>
  </div>
  <div class="garden-bed"><span></span><span></span><span></span><span></span></div>
  <div class="calendar-icon">
    <i class="ring r1"></i><i class="ring r2"></i>
    <div class="cal-grid"></div>
    <b>✓</b>
  </div>
</div>`,
doctor:()=>`
<div class="visual approved-doctor">
  <div class="doctor-leaf">
    <i class="spot s1"></i><i class="spot s2"></i><i class="spot s3"></i>
    <i class="vein v1"></i><i class="vein v2"></i><i class="vein v3"></i>
  </div>
  <div class="magnifier"><div class="lens"></div><div class="handle"></div></div>
</div>`,
identify:()=>`<div class="visual simple-identify"><div class="scan-flower"></div><div class="scan-corners"></div></div>`,
recommendations:()=>`<div class="visual simple-rec"><div class="globe"></div><div class="ai">AI</div><div class="weather">☀ ☁ ❄</div></div>`,
shop:()=>`<div class="visual simple-shop"><div class="watering-can"></div><div class="shop-plant"></div></div>`
};

function distance(i,a){
  let d=i-a,n=modules.length;
  if(d>n/2)d-=n;if(d<-n/2)d+=n;
  return d;
}
function render(){
  carousel.innerHTML=modules.map((m,i)=>{
    const d=distance(i,active);
    const role=d===0?"is-center":d===-1?"is-left":d===1?"is-right":"is-far";
    return `<button class="module-card ${role}" data-index="${i}" data-id="${m.id}" aria-label="${m.name}">
      ${visual[m.id]()}
      <div class="card-copy"><h2>${m.name}</h2><p>${m.subtitle}</p><span class="arrow">→</span></div>
    </button>`;
  }).join("");
  dots.innerHTML=modules.map((_,i)=>`<button class="dot ${i===active?"active":""}" data-index="${i}"></button>`).join("");
}
function setActive(i){active=(i+modules.length)%modules.length;render()}
function nudge(d){setActive(active+d)}
carousel.addEventListener("click",e=>{
  const c=e.target.closest(".module-card");if(!c)return;
  const i=Number(c.dataset.index);if(i!==active)setActive(i);
});
dots.addEventListener("click",e=>{const d=e.target.closest(".dot");if(d)setActive(Number(d.dataset.index))});
carousel.addEventListener("pointerdown",e=>{startX=e.clientX;carousel.setPointerCapture?.(e.pointerId)});
carousel.addEventListener("pointerup",e=>{if(startX===null)return;const dx=e.clientX-startX;if(Math.abs(dx)>44)nudge(dx<0?1:-1);startX=null});
carousel.addEventListener("pointercancel",()=>startX=null);
window.addEventListener("keydown",e=>{if(e.key==="ArrowRight")nudge(1);if(e.key==="ArrowLeft")nudge(-1)});
render();