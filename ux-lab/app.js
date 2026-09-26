const modules=[
  {id:"design",name:"Garden Design",approvedImage:"./assets/design-approved-card.webp"},
  {id:"garden",name:"My Garden",approvedImage:"./assets/garden-approved-card.webp"},
  {id:"doctor",name:"Plant Doctor",approvedImage:"./assets/doctor-approved-card.webp"},
  {id:"identify",name:"Plant ID",subtitle:"Identify any plant instantly."},
  {id:"recommendations",name:"Smart Recommendations",subtitle:"Find the right plants for your space."},
  {id:"shop",name:"Shop",subtitle:"Plants, tools and more for your garden."}
];

let active=1,startX=null;
const carousel=document.getElementById("carousel");
const dots=document.getElementById("dots");

function distance(i,a){
  let d=i-a,n=modules.length;
  if(d>n/2)d-=n;
  if(d<-n/2)d+=n;
  return d;
}

function fallbackVisual(m){
  if(m.id==="identify") return '<div class="visual simple-identify"><div class="scan-flower"></div><div class="scan-corners"></div></div>';
  if(m.id==="recommendations") return '<div class="visual simple-rec"><div class="globe"></div><div class="ai">AI</div><div class="weather">☀ ☁ ❄</div></div>';
  return '<div class="visual simple-shop"><div class="watering-can"></div><div class="shop-plant"></div></div>';
}

function render(){
  carousel.innerHTML=modules.map((m,i)=>{
    const d=distance(i,active);
    const role=d===0?"is-center":d===-1?"is-left":d===1?"is-right":"is-far";
    if(m.approvedImage){
      return `<button class="module-card approved-image-card ${role}" data-index="${i}" data-id="${m.id}" aria-label="${m.name}">
        <img class="approved-card-image" src="${m.approvedImage}" alt="${m.name}">
      </button>`;
    }
    return `<button class="module-card ${role}" data-index="${i}" data-id="${m.id}" aria-label="${m.name}">
      ${fallbackVisual(m)}
      <div class="card-copy"><h2>${m.name}</h2><p>${m.subtitle}</p><span class="arrow">→</span></div>
    </button>`;
  }).join("");
  dots.innerHTML=modules.map((_,i)=>`<button class="dot ${i===active?"active":""}" data-index="${i}" aria-label="Go to module ${i+1}"></button>`).join("");
}
function setActive(i){active=(i+modules.length)%modules.length;render()}
function nudge(d){setActive(active+d)}
carousel.addEventListener("click",e=>{
  const c=e.target.closest(".module-card"); if(!c)return;
  const i=Number(c.dataset.index);
  if(i!==active)setActive(i);
});
dots.addEventListener("click",e=>{const d=e.target.closest(".dot");if(d)setActive(Number(d.dataset.index))});
carousel.addEventListener("pointerdown",e=>{startX=e.clientX;carousel.setPointerCapture?.(e.pointerId)});
carousel.addEventListener("pointerup",e=>{if(startX===null)return;const dx=e.clientX-startX;if(Math.abs(dx)>44)nudge(dx<0?1:-1);startX=null});
carousel.addEventListener("pointercancel",()=>startX=null);
window.addEventListener("keydown",e=>{if(e.key==="ArrowRight")nudge(1);if(e.key==="ArrowLeft")nudge(-1)});
render();