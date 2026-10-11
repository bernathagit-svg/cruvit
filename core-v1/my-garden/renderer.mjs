// Deterministic, localized replacement of baked user data. The approved PNG is never modified.
export const W=722,H=1230;
export const MY_PLANTS_REVIEW='https://myplants-dynamic-review--cruvit-core-v1-e2e-preview.netlify.app/';
export const REGIONS=Object.freeze([
 {id:'plant-count',x:108,y:866,w:40,h:25},
 {id:'upcoming-count',x:268,y:866,w:36,h:25},
 {id:'attention-badge',x:69,y:940,w:81,h:81},
 {id:'attention-description',x:163,y:988,w:445,h:23},
 {id:'notification-unread-marker',x:512,y:1092,w:12,h:13}
]);
let imagePromise;
async function reference(){if(!imagePromise)imagePromise=new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{if(im.naturalWidth!==W||im.naturalHeight!==H)return reject(Error('Reference dimensions differ'));resolve(im)};im.onerror=()=>reject(Error('Approved image failed'));im.src=new URL('./assets/approved-my-garden.png',import.meta.url).href});return imagePromise}
function clearRectFromEdges(ctx,r){const {x,y,w,h}=r;const top=ctx.getImageData(x,y-1,w,1).data,bottom=ctx.getImageData(x,y+h,w,1).data,d=ctx.createImageData(w,h);for(let row=0;row<h;row++){const a=(row+1)/(h+1);for(let col=0;col<w;col++){const i=(row*w+col)*4,j=col*4;for(let ch=0;ch<3;ch++)d.data[i+ch]=Math.round(top[j+ch]*(1-a)+bottom[j+ch]*a);d.data[i+3]=255}}ctx.putImageData(d,x,y)}
function box(el,x,y,w,h){Object.assign(el.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});return el}
function dynamicText(field,value,cls,x,y,w,h){const e=document.createElement('span');e.dataset.field=field;e.className=cls;e.textContent=String(value);return box(e,x,y,w,h)}
export async function renderSummary(stage,model,{onAction=()=>{}}={}){
 if(!model||!Number.isInteger(model.plantCount)||model.plantCount<0)throw Error('Verified summary required');
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.className='plate';canvas.setAttribute('aria-hidden','true');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(await reference(),0,0);
 for(const r of REGIONS)if(r.id!=='attention-badge')clearRectFromEdges(ctx,r);
 // Neutralize the data-dependent red badge without changing its geometry.
 // The neutral unknown indicator is NOT a zero-alert or healthy-garden claim.
 const badge=REGIONS[2],d=ctx.getImageData(badge.x,badge.y,badge.w,badge.h);
 for(let i=0;i<d.data.length;i+=4){const R=d.data[i],G=d.data[i+1],B=d.data[i+2];if(R>170&&R>G+35&&R>B+25){d.data[i]=123;d.data[i+1]=137;d.data[i+2]=112}}
 ctx.putImageData(d,badge.x,badge.y);
 ctx.save();ctx.beginPath();ctx.arc(109,979.5,35.5,0,Math.PI*2);ctx.clip();ctx.fillStyle='rgb(123,137,112)';ctx.fillRect(71,942,76,76);ctx.restore();
 const content=document.createDocumentFragment();content.append(canvas,
 dynamicText('plant-count',model.plantCount,'count plant-count',108,866,40,25),
 dynamicText('upcoming-count',model.upcomingCount??'?','count upcoming-count',268,866,36,25),
 dynamicText('attention-count',model.attentionCount??'?','attention-count',72,952,74,56),
 dynamicText('attention-description',model.description,'attention-description',165,988,443,24));
 const h=document.createElement('a');h.className='hit plants-hit';h.href=MY_PLANTS_REVIEW;h.setAttribute('aria-label','Open My Plants approved dynamic review — '+model.plantCount+' plants');h.dataset.action='MY_PLANTS';box(h,51,706,151,187);content.append(h);
 const hits=[['CHANGE_PHOTO',375,130,305,79],['SEARCH',515,39,76,76],['PROFILE',600,39,77,76],['UPCOMING',211,706,151,187],['JOURNAL',369,706,152,187],['ADD_PLANT',528,706,151,187],['ATTENTION',49,920,630,119],['HOME',44,1068,118,110],['GARDEN',165,1068,140,110],['ADD_PLANT',310,1060,111,109],['NOTIFICATIONS',440,1068,125,110],['MORE',579,1068,106,110]];
 for(const [action,x,y,w,h]of hits){const e=document.createElement('button');e.type='button';e.className='hit';e.dataset.action=action;e.setAttribute('aria-label',action.replaceAll('_',' ')+' — review only');box(e,x,y,w,h);e.onclick=()=>onAction(action,model);content.append(e)}
 stage.replaceChildren(content);stage.style.width=W+'px';stage.style.height=H+'px';stage.setAttribute('role','region');stage.setAttribute('aria-label','My Garden dynamic visual review');
 return {gardenId:model.gardenId,plantCount:model.plantCount,upcomingCount:model.upcomingCount,attentionCount:model.attentionCount,notificationUnreadCount:model.notificationUnreadCount,description:model.description,regions:REGIONS,plantsTarget:MY_PLANTS_REVIEW};
}
