import {createPreviewClient,metricDelta} from '../../my-garden/shared/preview-session.mjs';
import {createIdentifierSaveController,SAVE_KEY} from './save-controller.mjs';
import {createPreviewSaveDomain} from './preview-domain.mjs';
// This composition root explicitly provides the authenticated dependency. There is no implicit domain fallback.
const runtime=createPreviewClient({atomicSave:true});
const domain=createPreviewSaveDomain({client:runtime.client,metrics:runtime.metrics,delta:before=>metricDelta(runtime.metrics(),before)});
const stateKey='cruvit-core-v1-c5-budget:'+SAVE_KEY;
const stateStore={read(){const text=sessionStorage.getItem(stateKey);if(!text)return {attempts:0};const v=JSON.parse(text);if(!Number.isInteger(v.attempts)||v.attempts<0||v.attempts>2)throw Error('Invalid bounded save state');return v;},write(value){sessionStorage.setItem(stateKey,JSON.stringify(value));}};
const controller=createIdentifierSaveController({domain,stateStore,record(receipt){
 const key=receipt.attempt===1?'first-save':'retry';sessionStorage.setItem('cruvit-core-v1-c5-'+key,JSON.stringify(receipt));
 // Public evidence excludes auth values. It is not used as the garden data source.
 window.__CRUVIT_COMMIT5_SAVE=receipt;
}});
document.getElementById('stage').dispatchEvent(new CustomEvent('cruvit-pi-save-bind',{detail:{save:()=>controller.save()}}));
