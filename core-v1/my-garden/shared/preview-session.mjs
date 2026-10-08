// Shared public Preview Auth. Credentials are entered only in the browser; never logged/exported.
// A real session survives same-tab route navigation in sessionStorage. It is never sent in a URL.
export const PREVIEW_URL='https://pwgeygwafuinwkpmnzxp.supabase.co';
export const PUBLIC_KEY='sb_publishable_FqkszZTjO3XXbZBaDojCyQ_hY85Kfbo';
export const GARDEN_ID='a2b4080d-3858-4f71-b5ac-23847aa17e1d';
export const ROUTES=Object.freeze({home:'/core-v1/',garden:'/core-v1/my-garden/',plants:'/core-v1/my-garden/plants/',acceptance:'/core-v1/my-garden/_acceptance/'});
const KEY='cruvit-core-v1-preview-auth-v1';
export function isPreviewOrigin(origin){try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='cruvit-core-v1-e2e-preview.netlify.app'||u.hostname==='commit4-integration--cruvit-core-v1-e2e-preview.netlify.app'||/^[a-f0-9]{24}--cruvit-core-v1-e2e-preview\.netlify\.app$/.test(u.hostname))}catch{return false}}
export function createPreviewClient({isolated=false,label='primary'}={}){
 if(!isPreviewOrigin(location.origin))throw Error('This runtime is restricted to the isolated Core V1 Preview.');
 if(!globalThis.supabase?.createClient)throw Error('Supabase public client failed to load.');
 const totals={authRequests:0,databaseReads:0,storageSignRequests:0,blockedRequests:0,externalProviderCalls:0,paidAICalls:0};
 const countedFetch=async(input,init)=>{
  const u=new URL(typeof input==='string'?input:input.url),method=(init?.method??input?.method??'GET').toUpperCase();
  if(u.origin!==PREVIEW_URL){totals.blockedRequests++;throw Error('Foreign Supabase project blocked.');}
  if(u.pathname.startsWith('/rest/v1/')&&['GET','HEAD'].includes(method))totals.databaseReads++;
  else if(u.pathname.startsWith('/auth/v1/')&&((method==='GET'&&(u.pathname==='/auth/v1/user'||u.pathname.endsWith('/jwks.json')))||(method==='POST'&&['/auth/v1/token','/auth/v1/logout'].includes(u.pathname))))totals.authRequests++;
  else if(u.pathname.startsWith('/storage/v1/object/sign/user-garden-media')&&method==='POST')totals.storageSignRequests++;
  else{totals.blockedRequests++;throw Error('Operation outside Commit 4 read/Auth scope.');}
  return fetch(input,init);
 };
 const auth={storageKey:isolated?'cruvit-core-v1-isolated-'+label:KEY,persistSession:!isolated,autoRefreshToken:!isolated,detectSessionInUrl:false,flowType:'implicit'};
 if(!isolated){sessionStorage.getItem(KEY);auth.storage=sessionStorage;}
 const client=globalThis.supabase.createClient(PREVIEW_URL,PUBLIC_KEY,{auth,global:{fetch:countedFetch}});
 return {client,metrics:()=>({...totals})};
}
export function metricDelta(after,before){return Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-(before[k]??0)]));}
export function clearLocalSession(){sessionStorage.removeItem(KEY);}
export function saveSafeEvidence(screen,value){
 // The caller passes a whitelist projection: no password, JWT, refresh token, session or signed URL.
 sessionStorage.setItem('cruvit-core-v1-evidence-'+screen,JSON.stringify(value));
}
