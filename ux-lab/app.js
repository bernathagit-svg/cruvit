const modules=[
  {
    id:"design",
    name:"Garden Design",
    subtitle:"Design your dream garden with your phone.",
    image:"/homepage-v1/assets/sanctuary-cta.jpg"
  },
  {
    id:"garden",
    name:"My Garden",
    subtitle:"Track, care and grow your garden.",
    image:"/homepage-v1/assets/my-garden-desktop.png"
  },
  {
    id:"doctor",
    name:"Plant Doctor",
    subtitle:"Detect problems and get solutions.",
    image:"/homepage-v1/assets/privacy-botanical.jpg"
  },
  {
    id:"identify",
    name:"Plant ID",
    subtitle:"Identify any plant instantly.",
    image:"/homepage-v1/assets/store-plant-care.jpg"
  },
  {
    id:"recommendations",
    name:"Smart Recommendations",
    subtitle:"Find the right plants for your space.",
    image:"/homepage-v1/assets/store-kits.jpg"
  },
  {
    id:"shop",
    name:"Shop",
    subtitle:"Plants, tools and more for your garden.",
    image:"/homepage-v1/assets/store-watering.jpg"
  }
];

let active=1;
let startX=null;
const carousel=document.getElementById("carousel");
const dots=document.getElementById("dots");

function circularDistance(i,a){
  let d=i-a;
  const n=modules.length;
  if(d>n/2)d-=n;
  if(d<-n/2)d+=n;
  return d;
}
function cardVisual(m){
  if(m.id==="garden"){
    return '<div class="visual garden-object"><img src="'+m.image+'" alt=""><span class="tree-glow"></span><span class="calendar"></span></div>';
  }
  if(m.id==="design"){
    return '<div class="visual"><img src="'+m.image+'" alt=""><span class="design-phone"></span></div>';
  }
  if(m.id==="doctor"){
    return '<div class="visual"><img src="'+m.image+'" alt=""><span class="doctor-leaf"></span><span class="doctor-lens"></span></div>';
  }
  if(m.id==="identify"){
    return '<div class="visual"><img src="'+m.image+'" alt=""><span class="id-plant"></span></div>';
  }
  if(m.id==="recommendations"){
    return '<div class="visual"><img src="'+m.image+'" alt=""><span class="rec-globe"></span></div>';
  }
  return '<div class="visual"><img src="'+m.image+'" alt=""><span class="shop-kit"></span></div>';
}
function render(){
  carousel.innerHTML=modules.map((m,i)=>{
    const d=circularDistance(i,active);
    const role=d===0?"is-center":d===-1?"is-left":d===1?"is-right":"is-far";
    return '<button class="module-card '+role+'" data-index="'+i+'" data-id="'+m.id+'" aria-label="'+m.name+'">'+
      cardVisual(m)+
      '<span class="card-copy"><h2>'+m.name+'</h2><p>'+m.subtitle+'</p><span class="arrow">→</span></span>'+
    '</button>';
  }).join("");

  dots.innerHTML=modules.map((_,i)=>'<button class="dot '+(i===active?"active":"")+'" data-index="'+i+'" aria-label="Go to module '+(i+1)+'"></button>').join("");
}
function setActive(i){
  active=(i+modules.length)%modules.length;
  render();
}
function nudge(dir){setActive(active+dir)}

carousel.addEventListener("click",e=>{
  const card=e.target.closest(".module-card");
  if(!card)return;
  const i=Number(card.dataset.index);
  if(i!==active){setActive(i);return;}
  if(modules[i].id==="garden"){
    window.location.hash="my-garden";
  }
});
dots.addEventListener("click",e=>{
  const dot=e.target.closest(".dot");
  if(dot)setActive(Number(dot.dataset.index));
});
carousel.addEventListener("pointerdown",e=>{
  startX=e.clientX;
  carousel.setPointerCapture?.(e.pointerId);
});
carousel.addEventListener("pointerup",e=>{
  if(startX===null)return;
  const delta=e.clientX-startX;
  if(Math.abs(delta)>44)nudge(delta<0?1:-1);
  startX=null;
});
carousel.addEventListener("pointercancel",()=>startX=null);
window.addEventListener("keydown",e=>{
  if(e.key==="ArrowRight")nudge(1);
  if(e.key==="ArrowLeft")nudge(-1);
});

render();