#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
const file=path.join(ROOT,'data/catalog/revalidation/semantic-audit-open-findings-v1.json');
const doc=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const rows=Array.isArray(doc.rows)?doc.rows:[];
function upsert(row){
  const i=rows.findIndex(x=>x.findingId===row.findingId);
  if(i>=0) rows[i]={...rows[i],...row}; else rows.push(row);
}
upsert({
 findingId:'SEM-2026-10-02-MONSTERA-EDIBLE-SAFETY',
 slug:'monstera',scientific:'Monstera deliciosa',status:'OPEN',severity:'MATERIAL_DATA_GAP',
 queuePriority:'P2_EVIDENCE_ENRICHMENT',
 reason:'Exact-species runtime record models Monstera only as a toxic houseplant, omitting its edible fully-ripe fruit, unripe-fruit calcium-oxalate hazard, and source-backed fruiting requirements.',
 requiredAction:'Owner-reviewed source-backed canonical packet before clearing finding.',
 sources:['https://plants.ces.ncsu.edu/plants/monstera-deliciosa/','https://ask.ifas.ufl.edu/publication/hs311','https://edis.ifas.ufl.edu/publication/EP639']
});upsert({
 findingId:'SEM-2026-10-02-CYCAS-NOT-APPLICABLE-REPRO',
 slug:'cycas',scientific:'Cycas revoluta',status:'OPEN',severity:'SEMANTIC_MODEL_GAP',
 queuePriority:'P2_EVIDENCE_ENRICHMENT',
 reason:'Exact-species runtime record leaves flowering and fruiting UNKNOWN even though Cycas revoluta is a gymnosperm that does not flower or produce botanical fruit; it forms separate male/female cones and seeds.',
 requiredAction:'Owner-reviewed source-backed canonical packet with explicit not-applicable flowering/fruiting semantics before clearing finding.',
 sources:['https://plants.ces.ncsu.edu/plants/cycas-revoluta/common-name/sago-palm/','https://edis.ifas.ufl.edu/publication/FR316','https://edis.ifas.ufl.edu/publication/EP608']
});
doc.updatedAt='2026-10-02';
doc.rows=rows;
fs.writeFileSync(file,JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({
 open:rows.filter(x=>x.status==='OPEN').map(x=>x.slug),
 resolved:rows.filter(x=>x.status==='RESOLVED').map(x=>x.slug)
},null,2));
