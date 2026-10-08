import{bindGardenNavigation}from'./navigation.mjs';
// Thin integration only; both approved renderers and data modules remain byte-identical.
import{createPreviewClient,clearLocalSession,metricDelta,saveSafeEvidence,ROUTES}from'./preview-session.mjs';
const $=id=>document.getElementById(id),screen=document.body.dataset.screen,isPlants=screen==='plants';
const base=isPlants?'../plants/':'../';
const data=await import(new URL(base+'data.mjs',import.meta.url));
const visual=await import(new URL(base+'renderer.mjs',import.meta.url));
const W=visual.W,H=visual.H;
let runtime=null,current=null,version=0,busy=false,query='',searchTimer=null;
function resize(){const scale=Math.min(innerWidth/W,innerHeight/H);$('viewport').style.width=(W*scale)+'px';$('viewport').style.height=(H*scale)+'px';$('stage').style.transform=Math.abs(scale-1)<1e-9?'none':'scale('+scale+')';}
addEventListener('resize',resize);resize();
function say(title,body){$('dialogTitle').textContent=title;$('dialogBody').textContent=body;$('infoDialog').showModal();}
$('dialogClose').onclick=()=>$('infoDialog').close();
function showGate(message){version++;current=null;clearTimeout(searchTimer);$('stage').replaceChildren();$('stage').hidden=true;$('accessGate').hidden=false;$('authResult').textContent=message;window.__CRUVIT_CORE_V1={screen,status:'BLOCKED',liveAuthProof:false};}
function navigate(target){if(!current)return;if(target===ROUTES.plants){saveSafeEvidence('navigation-pending',{from:location.pathname,to:target,gardenId:data.GARDEN_ID,at:new Date().toISOString()});}location.assign(target);}
function selectPlant(plant){say(plant.name,plant.scientificName+'\n'+plant.id+'\n\nRead-only Preview. Plant Detail and photo editing are not enabled in Commit 4.\n\n'+(plant.systemImage.attribution??''));}
function action(name,value){
 if(name==='HOME'){navigate(ROUTES.home);return}if(name==='GARDEN'){if(isPlants)navigate(ROUTES.garden);return}
 if(name==='SEARCH'&&isPlants){query=value??'';clearTimeout(searchTimer);searchTimer=setTimeout(()=>draw(true),150);return}
 if(name==='ALL'&&isPlants){query='';draw();return}
 if(name==='PROFILE'){say('Preview account','This is the authenticated, read-only Preview garden. To sign out, use the sign-out control below.');$('signoutButton').hidden=false;return}
 if(name==='ATTENTION'){say('Attention','The total attention count is unknown. An empty task list does not mean the plants are healthy.');return}
 say('Read-only Preview',name==='FILTER'?'Category counts are unknown; search uses the actual records returned from Preview.':'This action is not enabled in Commit 4. No data was changed.');
}
function publish(model,render,measured){
 const receipt={screen,route:location.pathname,navigationType:performance.getEntriesByType('navigation')[0]?.type??'unknown',sourceMode:'live-authenticated',liveAuthProof:true,gardenId:data.GARDEN_ID,readAt:model.readAt,measuredRequests:measured,declaredLoadCounts:model.counts,externalProviderCalls:0,paidAICalls:0};
 if(isPlants){receipt.plants=model.cards.map(p=>({id:p.id,profileSlug:p.profileSlug,name:p.name,scientificName:p.scientificName,status:p.status,areaName:p.areaName,imageKind:p.image.kind,coverMediaId:p.personal?.id??null,catalogSourceAssetId:p.systemImage.sourceAssetId,catalogAuthorityUrl:p.systemImage.url}));receipt.render={visibleIds:render.visibleIds,visibleNames:render.visibleNames,images:[...$('stage').querySelectorAll('.plant-image')].map(im=>({id:im.dataset.plantId,complete:im.complete&&im.naturalWidth>0,sourceKind:im.dataset.sourceKind}))};}
 else{receipt.summary={plantCount:model.plantCount,upcomingCount:model.upcomingCount,attentionCount:model.attentionCount,unreadCount:model.notificationUnreadCount,description:model.description};receipt.plants=model.plants;}
 window.__CRUVIT_CORE_V1=receipt;saveSafeEvidence(screen,receipt);
 if(isPlants){try{const pending=JSON.parse(sessionStorage.getItem('cruvit-core-v1-evidence-navigation-pending')||'null');if(pending?.from===ROUTES.garden&&pending.to===ROUTES.plants&&pending.gardenId===data.GARDEN_ID)saveSafeEvidence('navigation',{...pending,arrivedAt:new Date().toISOString(),route:location.pathname,liveReadSucceeded:true,visiblePlantIds:render.visibleIds});sessionStorage.removeItem('cruvit-core-v1-evidence-navigation-pending');}catch{}}
}
async function draw(refocus=false,measured=current?.measuredRequests){
 if(!current)return;const token=++version,model=current;let render;
 try{render=isPlants?await visual.renderModel($('stage'),model,{query,onSelect:selectPlant,onAction:action}):await visual.renderSummary($('stage'),model,{onAction:action});
 if(token!==version||model!==current){if(!current)$('stage').replaceChildren();return}
 if(!isPlants)bindGardenNavigation($('stage'),{plantCount:model.plantCount,onNavigate:navigate});
 $('stage').hidden=false;$('accessGate').hidden=true;resize();publish(model,render,measured);
 if(refocus){const input=$('stage').querySelector('.plant-search');input?.focus();try{input?.setSelectionRange(query.length,query.length)}catch{}}
 }catch{showGate('The exact Preview data or approved screen could not be rendered. No mockup data is shown.');}
}
async function load(){const token=version,begin=runtime.metrics();try{const model=await data.loadLive(runtime.client);if(token!==version)return false;current={...model,measuredRequests:metricDelta(runtime.metrics(),begin)};query='';await draw(false,current.measuredRequests);return current!==null}catch{if(token===version)showGate('This Preview account cannot load the selected garden, or a read failed. No demo fallback.');return false}}
$('loginForm').onsubmit=async e=>{e.preventDefault();if(busy||!runtime)return;busy=true;$('loginButton').disabled=true;showGate('Signing in to Supabase Preview…');const email=$('email').value.trim(),password=$('password').value;$('password').value='';
 try{const r=await runtime.client.auth.signInWithPassword({email,password});if(r.error||!r.data?.session){showGate('Sign-in failed. Use your existing Preview account.');return}await load();}catch{showGate('The Preview connection could not be completed.');}finally{busy=false;$('loginButton').disabled=false}};
$('signoutButton').onclick=async()=>{showGate('Signed-out view.');try{const r=await runtime.client.auth.signOut({scope:'local'});if(r.error)$('authResult').textContent='Local view cleared; server sign-out was not confirmed.';}catch{$('authResult').textContent='Local view cleared; server sign-out was not confirmed.';}finally{clearLocalSession();$('infoDialog').close();$('signoutButton').hidden=true;}};
$('retryButton').onclick=async()=>{if(!busy&&runtime){busy=true;await load();busy=false;}};
addEventListener('pagehide',()=>{version++;current=null;$('stage').replaceChildren();$('stage').hidden=true;});
addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
try{runtime=createPreviewClient();runtime.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')showGate('Please sign in to Preview.');});const s=await runtime.client.auth.getSession();if(!s.error&&s.data?.session)await load();else showGate('Sign in to read your Preview garden.');}catch{showGate('This route runs only on the isolated Core V1 Preview.');$('loginButton').disabled=true;}
