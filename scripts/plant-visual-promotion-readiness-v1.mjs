import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateQaManifestPromotionReadiness } from '../modules/garden-design/asset-factory-v1/plant-visual-promotion-readiness-v1.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function arg(name,fallback=''){
  const p='--'+name+'=';
  const hit=process.argv.slice(2).find(x=>String(x).startsWith(p));
  return hit?String(hit).slice(p.length):fallback;
}
const manifestId=arg('manifest','wave1-owner-review-2026-09-22-v1');
const input=path.join(ROOT,'data','garden-design','plant-visual-qa-manifests',manifestId+'.json');
const output=path.join(ROOT,'data','garden-design','plant-visual-promotion-readiness',manifestId+'.json');
const manifest=JSON.parse(fs.readFileSync(input,'utf8'));
const readiness=evaluateQaManifestPromotionReadiness(manifest);
const report={
  ...readiness,
  sourceManifestId:manifestId,
  promotionAuthorized:manifest.productionPromotionAuthorized===true,
  executionAllowed:false,
  paidCalls:0,
  networkCalls:0,
  productionWrites:0,
  registryWrites:0
};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({
  manifestId,
  totalJobs:report.totalJobs,
  readyJobs:report.readyJobs,
  blockedJobs:report.blockedJobs,
  promotionAuthorized:report.promotionAuthorized,
  executionAllowed:false,
  output:path.relative(ROOT,output)
},null,2));
