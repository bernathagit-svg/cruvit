// No session/token access; only allowlisted, credential-free receipts created by live UI operations.
function read(k){try{return JSON.parse(sessionStorage.getItem(k)||'null')}catch{return null}}
function collect(){const r={firstSave:read('cruvit-core-v1-c5-first-save'),retry:read('cruvit-core-v1-c5-retry'),garden:read('cruvit-core-v1-evidence-garden'),plants:read('cruvit-core-v1-evidence-plants'),navigation:read('cruvit-core-v1-evidence-navigation')};document.getElementById('receipts').textContent=JSON.stringify(r,null,2);}
document.getElementById('collect').onclick=collect;collect();
