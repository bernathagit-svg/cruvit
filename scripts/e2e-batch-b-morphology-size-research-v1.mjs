import fs from 'node:fs';
import { extractStructuredMorphologyAndSize } from '../modules/catalog/morphology-size-evidence-gate-v1.js';

const slugs=[
  'bigleaf-hydrangea','borage','english-lavender','fig','lettuce','pomegranate','zinnia'
];
const rows=[];
for(const slug of slugs){
  const lifecycle=JSON.parse(fs.readFileSync('data/catalog/end-to-end-batch-b/lifecycle/'+slug+'.json','utf8'));
  const usable=(lifecycle.records||[]).find(x=>x?.sourcePolicyEligible===true && x?.excerpt);
  if(!usable){
    rows.push({canonicalSlug:slug,scientific:lifecycle.scientific,morphologyReady:false,sizeReady:false,code:'SOURCE_EXCERPT_MISSING'});
    continue;
  }
  const evidence=extractStructuredMorphologyAndSize(usable.excerpt);
  rows.push({
    canonicalSlug:slug,
    scientific:lifecycle.scientific,
    sourceId:usable.sourceId,
    sourceUrl:usable.url,
    institution:usable.institution,
    sourceTitle:usable.title,
    excerpt:usable.excerpt,
    ...evidence
  });
}
const summary={
  contract:'cruvit-e2e-batch-b-morphology-size-research-v1',
  createdAt:'2026-09-25',
  total:rows.length,
  morphologyReady:rows.filter(x=>x.morphologyReady).length,
  sizeReady:rows.filter(x=>x.matureSize?.ready).length,
  bothReady:rows.filter(x=>x.morphologyReady&&x.matureSize?.ready).length,
  paidCalls:0,
  catalogWrites:0,
  rows
};
fs.mkdirSync('data/catalog/end-to-end-batch-b/morphology-size',{recursive:true});
fs.writeFileSync('data/catalog/end-to-end-batch-b/morphology-size/summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
