import fs from 'node:fs';
import path from 'node:path';
import { activateVerifiedPromotionResults } from '../modules/garden-design/asset-factory-v1/plant-visual-registry-activation-v1.js';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),'..');
const manifestId='plant-intake-e2e-final-production-promotion-2026-10-05-v1';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/garden-design/plant-visual-qa-manifests',manifestId+'.json'),'utf8'));
const registryPath=path.join(root,'modules/garden-design/assets/plants/design-asset-registry-v1.json');
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));

const verified=[
  {
    jobId:'strelitzia__mature__default__flowering__v1',
    ok:true,
    code:'PROMOTED_AND_VERIFIED',
    productionKey:'production/strelitzia/mature__default__flowering/strelitzia__mature__default__flowering__v1__4b39276b60e3__4b39276b60e35a065cca385ad8474b3698780bf7ee275cb208ab4115c0158245.png',
    sha256:'4b39276b60e35a065cca385ad8474b3698780bf7ee275cb208ab4115c0158245',
    bytes:2039913
  },
  {
    jobId:'hibiscus__mature__shrub__flowering__v1',
    ok:true,
    code:'PROMOTED_AND_VERIFIED',
    productionKey:'production/hibiscus/mature__shrub__flowering/hibiscus__mature__shrub__flowering__v1__d833d4a20451__d833d4a2045135e7a88bf2dde9574b3b5d00f4a4c5c89e3e85c97dc72f158c08.png',
    sha256:'d833d4a2045135e7a88bf2dde9574b3b5d00f4a4c5c89e3e85c97dc72f158c08',
    bytes:2138812
  },
  {
    jobId:'lemon__mature__tree__fruiting__v1',
    ok:true,
    code:'PROMOTED_AND_VERIFIED',
    productionKey:'production/lemon/mature__tree__fruiting/lemon__mature__tree__fruiting__v1__2a4fb9267385__2a4fb92673858b8217840ce7515a0a7fab09666c2903cf7a72ae7e388a939f0d.png',
    sha256:'2a4fb92673858b8217840ce7515a0a7fab09666c2903cf7a72ae7e388a939f0d',
    bytes:2316870
  },
  {
    jobId:'cyclamen__mature__default__flowering__v1',
    ok:true,
    code:'PROMOTED_AND_VERIFIED',
    productionKey:'production/cyclamen/mature__default__flowering/cyclamen__mature__default__flowering__v1__b5adc258e137__b5adc258e13715c021cde93cd2bbd6981f93912c98a72f82a2abca30762a5c42.png',
    sha256:'b5adc258e13715c021cde93cd2bbd6981f93912c98a72f82a2abca30762a5c42',
    bytes:2152387
  }
];

const allowed=new Set(verified.map(x=>x.jobId));
if(manifest.rows.length!==4 || !manifest.rows.every(r=>allowed.has(r.jobId))) throw new Error('MANIFEST_SCOPE_MISMATCH');

const result=activateVerifiedPromotionResults(registry,manifest,{results:verified});
if(result.activatedJobs!==4 || result.skippedJobs!==0) {
  throw new Error('REGISTRY_ACTIVATION_NOT_4_OF_4 '+JSON.stringify({activated:result.activated,skipped:result.skipped}));
}
fs.writeFileSync(registryPath,JSON.stringify(result.registry,null,2)+'\n');
const reportPath=path.join(root,'data/garden-design/plant-visual-registry-activation',manifestId+'.json');
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,JSON.stringify({
  version:result.version,
  manifestId:result.manifestId,
  activatedJobs:result.activatedJobs,
  skippedJobs:result.skippedJobs,
  activated:result.activated,
  skipped:result.skipped,
  networkCalls:0,
  r2Writes:0
},null,2)+'\n');
console.log(JSON.stringify({manifestId,activatedJobs:result.activatedJobs,skippedJobs:result.skippedJobs,activated:result.activated},null,2));
