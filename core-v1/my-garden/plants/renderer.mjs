// Deterministic reconstruction only in declared baked-data regions.
// The original 941x1672 PNG is unchanged. No inpainting model or image generation is used.
export const W=941,H=1672;
export const SLOTS=[
 {x:49,y:413,w:266,h:293,ix:50,iy:414,iw:264,ih:164},
 {x:337,y:413,w:266,h:293,ix:338,iy:414,iw:264,ih:164},
 {x:627,y:413,w:266,h:293,ix:628,iy:414,iw:264,ih:164},
 {x:49,y:724,w:266,h:311,ix:50,iy:725,iw:264,ih:168},
 {x:337,y:724,w:266,h:311,ix:338,iy:725,iw:264,ih:168},
 {x:627,y:724,w:266,h:311,ix:628,iy:725,iw:264,ih:168},
 {x:49,y:1054,w:266,h:304,ix:50,iy:1055,iw:264,ih:167},
 {x:337,y:1054,w:266,h:304,ix:338,iy:1055,iw:264,ih:167},
 {x:627,y:1054,w:266,h:304,ix:628,iy:1055,iw:264,ih:167}
];
export const CHIP_RECTS=[{x:72,y:345,w:82,h:32},{x:198,y:345,w:88,h:32},{x:329,y:345,w:98,h:32},{x:469,y:345,w:94,h:32},{x:607,y:345,w:112,h:32}];
const original=new Image();original.src='./assets/approved-my-plants.png';
const sourceReady=original.decode();
const sourceCanvas=document.createElement('canvas');sourceCanvas.width=W;sourceCanvas.height=H;
let sourcePixels=null;
function sample(x,y){const a=sourcePixels.data,out=[0,0,0];let n=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const ix=Math.max(0,Math.min(W-1,Math.round(x+dx))),iy=Math.max(0,Math.min(H-1,Math.round(y+dy))),i=(iy*W+ix)*4;for(let c=0;c<3;c++)out[c]+=a[i+c];n++}return out.map(v=>v/n)}
function inRounded(x,y,w,h,r){const cx=Math.max(r,Math.min(w-r,x)),cy=Math.max(r,Math.min(h-r,y));return (x-cx)**2+(y-cy)**2<=r*r;}
function erase(ctx,rect,mode='vertical',radius=0){
 const {x,y,w,h}=rect,p=ctx.getImageData(x,y,w,h);
 if(mode==='blend'){
  const top=Array.from({length:w},(_,i)=>sample(x+i,y-2)),bottom=Array.from({length:w},(_,i)=>sample(x+i,y+h+2));
  const left=Array.from({length:h},(_,j)=>sample(x-2,y+j)),right=Array.from({length:h},(_,j)=>sample(x+w+2,y+j));
  const tl=sample(x-2,y-2),tr=sample(x+w+2,y-2),bl=sample(x-2,y+h+2),br=sample(x+w+2,y+h+2);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const k=(j*w+i)*4,u=i/(w-1),v=j/(h-1);for(let c=0;c<3;c++){const edge=top[i][c]*(1-v)+bottom[i][c]*v+left[j][c]*(1-u)+right[j][c]*u;const corners=tl[c]*(1-u)*(1-v)+tr[c]*u*(1-v)+bl[c]*(1-u)*v+br[c]*u*v;p.data[k+c]=Math.round(Math.max(0,Math.min(255,edge-corners)))}p.data[k+3]=255}
 }else{
  // Detect just the baked light glyphs and diffuse their mask, retaining the glass texture between letters.
  let mask=new Uint8Array(w*h);for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++){const k=(j*w+i)*4,a=p.data.slice(k,k+3);if(Math.min(...a)>115&&Math.max(...a)-Math.min(...a)<100)mask[j*w+i]=1;}
  for(let n=0;n<2;n++){const next=new Uint8Array(mask);for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++)if(mask[j*w+i])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)next[(j+dy)*w+i+dx]=1;mask=next;}
  const pixels=[];for(let j=1;j<h-1;j++)for(let i=1;i<w-1;i++)if(mask[j*w+i])pixels.push(j*w+i);
  const values=Float32Array.from(p.data);for(const q of pixels){const i=q%w,j=Math.floor(q/w),a=sample(x+i,y-3),b=sample(x+i,y+h+3);for(let c=0;c<3;c++)values[q*4+c]=a[c]*(1-j/h)+b[c]*j/h;}
  for(let n=0;n<100;n++)for(const q of pixels)for(let c=0;c<3;c++)values[q*4+c]=(values[(q-1)*4+c]+values[(q+1)*4+c]+values[(q-w)*4+c]+values[(q+w)*4+c])/4;
  for(const q of pixels)for(let c=0;c<3;c++)p.data[q*4+c]=Math.round(values[q*4+c]);
 }ctx.putImageData(p,x,y);
}
const box=(e,x,y,w,h)=>Object.assign(e.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
function node(tag,cls,text){const e=document.createElement(tag);e.className=cls;if(text!=null)e.textContent=text;return e;}
function statusText(s){return s==='unassessed'?'Not assessed':s==='unknown'?'Unknown':String(s).replaceAll('_',' ')}
let cachePromise=fetch('./assets/catalog-cache.json').then(r=>{if(!r.ok)throw Error('Image provenance cache unavailable');return r.json()});
export async function renderModel(host,model,{onSelect=()=>{},onAction=()=>{},query=''}={}){
 await sourceReady;
 if(!sourcePixels){const c=sourceCanvas.getContext('2d',{willReadFrequently:true});c.drawImage(original,0,0);sourcePixels=c.getImageData(0,0,W,H)}
 const cache=await cachePromise;
 if(model.cards.length>9)throw Error('This approved review composition supports 9 visible slots; no silent truncation');
 const all=model.cards,visible=all.filter(p=>[p.name,p.scientificName,p.areaName??''].join(' ').toLowerCase().includes(query.toLowerCase()));
 host.replaceChildren();host.className='native-screen';host.style.width=W+'px';host.style.height=H+'px';
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.className='plate';canvas.setAttribute('aria-hidden','true');host.append(canvas);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.putImageData(sourcePixels,0,0);
 const regions=[];
 const masks=(r,kind,mode='vertical',radius=0)=>{erase(ctx,r,mode,radius);regions.push({...r,kind})};
 CHIP_RECTS.forEach(r=>masks(r,'category-label-count'));
 // Clear baked search text, retaining the approved search control and icon.
 masks({x:117,y:265,w:315,h:38},'search-query');
 SLOTS.forEach((s,i)=>{
  const p=visible[i];
  if(!p){masks({x:s.x-8,y:s.y-8,w:s.w+16,h:s.h+16},'removed-nonexistent-card','blend',0);return}
  // Existing glass card, radius, border, shadow and spacing remain original pixels.
  const nameY=s.iy+s.ih+10,statusY=nameY+40,areaY=statusY+36;
  for(const r of [{x:s.x+15,y:nameY-2,w:s.w-28,h:34},{x:s.x+50,y:statusY-1,w:s.w-60,h:29},{x:s.x+50,y:areaY-1,w:s.w-60,h:28}])masks(r,'card-data-text');
  const a=node('article','plant-card');a.dataset.plantId=p.id;a.dataset.profileSlug=p.profileSlug;a.dataset.scientificName=p.scientificName;a.setAttribute('aria-label',p.name+' — '+p.scientificName);box(a,s.x,s.y,s.w,s.h);host.append(a);
  const img=node('img','plant-image');img.alt=p.name+' — '+p.scientificName;img.dataset.plantId=p.id;img.dataset.sourceKind=p.image.kind;
  const cached=p.image.kind==='catalog'?cache.find(c=>c.slug===p.profileSlug&&c.sourceUrl===p.image.url):null;
  img.src=cached?cached.localPath:p.image.url;img.dataset.sourceAssetId=p.image.sourceAssetId??p.image.mediaId??'';img.dataset.authority='Exact '+p.profileSlug+' '+p.image.kind;box(img,s.ix,s.iy,s.iw,s.ih);host.append(img);regions.push({x:s.ix,y:s.iy,w:s.iw,h:s.ih,kind:'plant-image'});
  img.onerror=()=>{img.hidden=true;const error=node('div','image-error','Image unavailable');box(error,s.ix,s.iy,s.iw,s.ih);host.append(error);onAction('The exact approved image could not be loaded. No substitute was selected.');};
  const label=node('div','plant-name',p.name);label.title=p.scientificName;label.dataset.plantId=p.id;box(label,s.x+18,nameY,s.w-30,31);host.append(label);
  const status=node('div','plant-status',statusText(p.status));status.dataset.source='garden_plants.status';box(status,s.x+55,statusY,s.w-63,27);host.append(status);
  const area=node('div','plant-area',p.areaName??'Not assigned');area.dataset.source='garden_area_id → garden_areas';box(area,s.x+55,areaY,s.w-63,27);host.append(area);
  const open=node('button','card-hit');open.type='button';open.title=p.scientificName;open.setAttribute('aria-label','Review '+p.name+' — '+p.scientificName);box(open,s.x,s.y,s.w,s.h);open.onclick=()=>onSelect(p);host.append(open);
  const menu=node('button','plant-menu','•••');menu.type='button';menu.setAttribute('aria-label','Plant actions for '+p.name);box(menu,s.x+s.w-55,s.y+9,44,44);menu.onclick=()=>onSelect(p);host.append(menu);regions.push({x:s.x+s.w-55,y:s.y+9,w:44,h:44,kind:'plant-menu-on-replaced-image'});
 });
 const labels=['All ('+model.activeCount+')','Trees (?)','Shrubs (?)','Herbs (?)','Flowers (?)'];
 CHIP_RECTS.forEach((r,i)=>{const t=node('button','chip-text',labels[i]);t.type='button';box(t,r.x-3,r.y-2,r.w+6,r.h+4);t.title=i?'No verified category field was supplied; the count is unknown.':'All active garden records';t.onclick=()=>i?onAction(t.title):onAction('ALL');host.append(t)});
 const search=node('input','plant-search');search.type='search';search.value=query;search.placeholder='Search your plants...';search.setAttribute('aria-label','Search your plants');box(search,117,263,525,41);search.oninput=()=>onAction('SEARCH',search.value);host.append(search);
 const hit=(label,r,action)=>{const b=node('button','nav-hit');b.type='button';b.setAttribute('aria-label',label);box(b,...r);b.onclick=()=>onAction(action);host.append(b)};
 hit('Back to My Garden',[40,12,226,60],'GARDEN');hit('Home',[25,1493,180,136],'HOME');hit('My Garden',[205,1493,180,136],'GARDEN');
 hit('Add Plant',[385,1493,180,136],'OUT_OF_SCOPE');hit('Design',[565,1493,180,136],'OUT_OF_SCOPE');hit('Shop',[745,1493,170,136],'OUT_OF_SCOPE');hit('Add plant',[48,1384,288,95],'OUT_OF_SCOPE');
 hit('Camera',[672,13,66,60],'PHOTO');hit('Share',[756,13,66,60],'OUT_OF_SCOPE');hit('More',[833,13,58,60],'OUT_OF_SCOPE');hit('Filter',[704,251,190,67],'FILTER');
 await Promise.all([...host.querySelectorAll('.plant-image')].map(im=>im.decode().catch(()=>null)));
 return {regions,visibleIds:visible.map(p=>p.id),visibleNames:visible.map(p=>p.name),referenceWidth:W,referenceHeight:H,imageSources:visible.map(p=>({plantId:p.id,profileSlug:p.profileSlug,kind:p.image.kind,authorityUrl:p.image.kind==='catalog'?p.image.url:undefined}))};
}
