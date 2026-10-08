import{createPreviewClient,metricDelta,ROUTES,saveSafeEvidence}from'../shared/preview-session.mjs';
import{runPlantRls}from'../shared/plant-rls.mjs';
const $=id=>document.getElementById(id);
const a=createPreviewClient(),b=createPreviewClient({isolated:true,label:'acceptance-b'});
let busy=false,screenWindow=null;
function collect(){const result={};for(const key of ['garden','plants','navigation','plant-rls']){try{result[key]=JSON.parse(sessionStorage.getItem('cruvit-core-v1-evidence-'+key)||'null')}catch{result[key]=null}}$('receipts').textContent=JSON.stringify(result,null,2);return result;}
for(const [side,entry]of [['A',a],['B',b]])$('form'+side).onsubmit=async e=>{
 e.preventDefault();if(busy)return;busy=true;const email=$('email'+side).value.trim(),password=$('pass'+side).value;$('pass'+side).value='';$('out'+side).textContent='מתבצעת התחברות…';
 try{const result=await entry.client.auth.signInWithPassword({email,password});if(result.error||!result.data?.session){$('out'+side).textContent='ההתחברות נכשלה. לא נשמרו פרטי הכניסה.';return}const verified=await entry.client.auth.getUser();$('out'+side).textContent=verified.error?'האימות לא הושלם.':JSON.stringify({user_id:verified.data.user.id,role:verified.data.user.role});}catch{$('out'+side).textContent='בקשת האימות נכשלה.';}finally{busy=false;}
};
$('runProof').onclick=async()=>{if(busy)return;busy=true;$('runProof').disabled=true;$('proof').textContent='RUNNING';const anon=createPreviewClient({isolated:true,label:'anon-'+crypto.randomUUID()}),ma=a.metrics(),mb=b.metrics(),mn=anon.metrics();
 try{const result=await runPlantRls(a.client,b.client,anon.client);const deltas=[metricDelta(a.metrics(),ma),metricDelta(b.metrics(),mb),metricDelta(anon.metrics(),mn)];result.measuredRequests=Object.fromEntries(Object.keys(ma).map(k=>[k,deltas.reduce((s,m)=>s+m[k],0)]));$('proof').textContent=JSON.stringify(result,null,2);saveSafeEvidence('plant-rls',result);window.__CRUVIT_PLANT_RLS=result;collect();}
 catch{$('proof').textContent='INCONCLUSIVE: request failed; no PASS.';}finally{busy=false;$('runProof').disabled=false;}
};
$('openGarden').onclick=e=>{e.preventDefault();location.assign(ROUTES.garden);};
$('collect').onclick=collect;collect();
const existing=await a.client.auth.getSession();if(!existing.error&&existing.data?.session){const u=await a.client.auth.getUser();$('outA').textContent=u.error?'אין אימות תקף.':JSON.stringify({user_id:u.data.user.id,role:u.data.user.role,existing_session:true});}else $('outA').textContent='התחברי עם User A.';
