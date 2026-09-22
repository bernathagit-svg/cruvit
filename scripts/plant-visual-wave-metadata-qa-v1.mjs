import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCanonicalCatalog } from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import { assessWaveMetadataQa } from '../modules/garden-design/asset-factory-v1/plant-visual-wave-metadata-qa-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function arg(name, fallback='') {
  const p='--'+name+'=';
  const hit=process.argv.slice(2).find(x=>String(x).startsWith(p));
  return hit ? String(hit).slice(p.length) : fallback;
}

const manifestId=arg('manifest','wave1-2026-09-22-v1');
const manifestPath=path.join(ROOT,'data','garden-design','plant-visual-qa-manifests',manifestId+'.json');
const outPath=path.join(ROOT,'data','garden-design','plant-visual-wave-metadata-qa',manifestId+'.json');

const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const catalog=loadCanonicalCatalog(ROOT);
const bySlug=new Map((catalog.plants||[]).map(p=>[p.canonicalSlug,p]));

const rows=(manifest.rows||[]).map(row=>{
  const plant=bySlug.get(row.canonicalSlug);
  if(!plant){
    return {
      jobId:row.jobId,
      canonicalSlug:row.canonicalSlug,
      result:'FAIL',
      reasons:['CANONICAL_PLANT_NOT_IN_CATALOG'],
      visualQaStillRequired:true,
      paidCalls:0,
      networkCalls:0
    };
  }
  return assessWaveMetadataQa(plant,row);
});

const report={
  contract:'plant-visual-wave-metadata-qa-report-v1',
  manifestId,
  totalJobs:rows.length,
  pass:rows.filter(r=>r.result==='PASS').length,
  fail:rows.filter(r=>r.result==='FAIL').length,
  visualQaStillRequired:rows.filter(r=>r.visualQaStillRequired===true).length,
  paidCalls:0,
  networkCalls:0,
  productionWrites:0,
  registryWrites:0,
  rows
};

fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({
  manifestId,
  totalJobs:report.totalJobs,
  pass:report.pass,
  fail:report.fail,
  visualQaStillRequired:report.visualQaStillRequired,
  paidCalls:0,
  networkCalls:0,
  output:path.relative(ROOT,outPath)
},null,2));
