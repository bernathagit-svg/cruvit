#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { classifyCatalogReadOnly, normalizeBatch3PacketForClassification } from '../modules/personal-domain/plant-data-contract-v1.js';
import { applyAllBootstrapStructuralClimateTraitsMigrations, getBootstrapSafeClimateTraitsMigrationPayload, getBootstrapUnlockedSixClimateTraitsMigrationPayload } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=process.cwd();
const seedRaw=JSON.parse(fs.readFileSync(path.join(ROOT,'data/plants.seed.json'),'utf8').replace(/^\uFEFF/,''));
const seed=Array.isArray(seedRaw)?seedRaw:(seedRaw.plants||[]);
const html=fs.readFileSync(path.join(ROOT,'app.html'),'utf8');
const start=html.indexOf('const PLANT_LIBRARY=['),end=html.indexOf('];',start),block=html.slice(start,end);
const bootstrapRecords=new Map();
for(const part of block.split(/\{slug:'/).slice(1)){
  const one=("{slug:'"+part).split('\n')[0];
  const slug=(one.match(/slug:'([^']+)'/)||[])[1];
  if(!slug) continue;
  const name=((one.match(/name:'((?:\\'|[^'])*)'/)||[])[1]||slug).replace(/\\'/g,"'");
  const scientific=((one.match(/scientific:'((?:\\'|[^'])*)'/)||[])[1]||'').replace(/\\'/g,"'");
  bootstrapRecords.set(String(slug).toLowerCase(),{name,scientific});
}
const bootstrap=[...bootstrapRecords.keys()];
const safe=getBootstrapSafeClimateTraitsMigrationPayload(),unlocked=getBootstrapUnlockedSixClimateTraitsMigrationPayload();
const ALIAS_TO_CANONICAL=Object.freeze({
  'apple-tree':'apple','pear-tree':'pear','peach-tree':'peach','plum-tree':'plum','fig-tree':'fig','grape-vine':'grapevine','passion-fruit':'passionfruit',
  'english-lavender':'lavender','spearmint':'mint','common-jasmine':'jasmine','bigleaf-hydrangea':'hydrangea','lesser-bougainvillea':'bougainvillea','bell-pepper':'sweet-pepper'
});
const canonicalSlug=(slug)=>ALIAS_TO_CANONICAL[String(slug||'').trim().toLowerCase()]||String(slug||'').trim().toLowerCase();
const runtimeBy=new Map();
for(const slug of bootstrap){const m=safe.plants[slug]||unlocked.plants[slug],raw=bootstrapRecords.get(slug)||{};runtimeBy.set(slug,{slug,name:m?.name||raw.name||slug,scientific:m?.scientific||raw.scientific||'Various bootstrap species',aliases:m?.aliases||[],_source:'bootstrap'});}
applyAllBootstrapStructuralClimateTraitsMigrations([...runtimeBy.values()],Object.fromEntries(runtimeBy));
for(const p of seed){const slug=String(p.slug||'').toLowerCase();if(slug)runtimeBy.set(slug,{...p,_source:'seed'});}
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const fp=path.join(dir,e.name);if(e.isDirectory())walk(fp,out);else if(e.name.endsWith('.packet.json'))out.push(fp);}return out;}
const packetFiles=walk(path.join(ROOT,'data/catalog-expansion'));
const packetBy=new Map(),packetMetaByNative=new Map(),packetContradictionByNative=new Map();for(const file of packetFiles){
  const packet=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const plant=normalizeBatch3PacketForClassification(packet);if(!plant?.slug)continue;
  packetBy.set(plant.slug,plant);
  packetMetaByNative.set(plant.slug,{file:path.relative(ROOT,file).replaceAll('\\','/'),packetId:packet.packetId||null,forceReview:packet.flags?.forceClimateNeedsReview===true});
  packetContradictionByNative.set(plant.slug,evaluatePacketContradictionDry(packet));
}
const runtimeReport=classifyCatalogReadOnly([...runtimeBy.values()]);
const packetReport=classifyCatalogReadOnly([...packetBy.values()]);
const runtimeCanonicalBy=new Map(),runtimeAliasesByCanonical=new Map();
for(const [native,p] of runtimeBy){const canon=canonicalSlug(native),aliases=runtimeAliasesByCanonical.get(canon)||[];aliases.push(native);runtimeAliasesByCanonical.set(canon,aliases);if(!runtimeCanonicalBy.has(canon)||native===canon)runtimeCanonicalBy.set(canon,{...p,slug:canon,_nativeRuntimeSlug:native});}
const packetCanonicalBy=new Map(),packetNativeByCanonical=new Map(),packetMetaByCanonical=new Map(),packetContradictionsByCanonical=new Map();
for(const [native,p] of packetBy){const canon=canonicalSlug(native),natives=packetNativeByCanonical.get(canon)||[];natives.push(native);packetNativeByCanonical.set(canon,natives);const metas=packetMetaByCanonical.get(canon)||[];metas.push({...packetMetaByNative.get(native),nativeSlug:native});packetMetaByCanonical.set(canon,metas);const checks=packetContradictionsByCanonical.get(canon)||[];checks.push(packetContradictionByNative.get(native));packetContradictionsByCanonical.set(canon,checks);if(!packetCanonicalBy.has(canon)||native===canon)packetCanonicalBy.set(canon,{...p,slug:canon,_nativePacketSlug:native});}
const canonicalPacketReport=classifyCatalogReadOnly([...packetCanonicalBy.values()]);
const unifiedBy=new Map(runtimeCanonicalBy);for(const [slug,p] of packetCanonicalBy)unifiedBy.set(slug,{...p,_source:runtimeCanonicalBy.has(slug)?'packet-overlay-runtime':'packet-only'});
const unifiedReport=classifyCatalogReadOnly([...unifiedBy.values()]);
const overlap=[...packetCanonicalBy.keys()].filter(s=>runtimeCanonicalBy.has(s)),runtimeOnly=[...runtimeCanonicalBy.keys()].filter(s=>!packetCanonicalBy.has(s)),packetOnly=[...packetCanonicalBy.keys()].filter(s=>!runtimeCanonicalBy.has(s));
const validUnknownReasons=new Set(['FLOWERING_REQUIREMENTS_MISSING','FRUITING_REQUIREMENTS_MISSING','HUMIDITY_UNKNOWN']);
const rows=unifiedReport.rows.map(r=>{const hasPacket=packetCanonicalBy.has(r.slug),hasRuntime=runtimeCanonicalBy.has(r.slug),source=hasPacket?(hasRuntime?'PACKET_OVERLAY_RUNTIME':'PACKET_ONLY'):'RUNTIME_ONLY',contradiction=(packetContradictionsByCanonical.get(r.slug)||[]).some(x=>x?.needsHold===true);let status='RESEARCH_REQUIRED';if(contradiction)status='CONTRADICTION';else if(r.identityScope==='broad')status='BROAD_IDENTITY_VALID';else if(r.readinessShort==='A')status='PASS_FULL';else if((r.unknownOutcomes||[]).length>0&&(r.reasons||[]).every(x=>validUnknownReasons.has(x)))status='UNKNOWN_VALID';return {...r,source,status,packet:packetMetaByCanonical.get(r.slug)||null,runtimeAliases:runtimeAliasesByCanonical.get(r.slug)||[],realContradiction:contradiction};}).sort((a,b)=>String(a.slug).localeCompare(String(b.slug)));
const statusCounts={PASS_FULL:0,UNKNOWN_VALID:0,BROAD_IDENTITY_VALID:0,RESEARCH_REQUIRED:0,CONTRADICTION:0};for(const row of rows)statusCounts[row.status]=(statusCounts[row.status]||0)+1;
const reasonFrequency={};for(const row of rows)for(const reason of row.reasons||[])reasonFrequency[reason]=(reasonFrequency[reason]||0)+1;
const nativeContradictionHolds=[...packetContradictionByNative.entries()].filter(([,x])=>x?.needsHold===true).map(([slug,x])=>({slug,holdFields:x.holdFields||[],counts:x.counts||{}}));
const broadIdentityRows=rows.filter(r=>r.status==='BROAD_IDENTITY_VALID');
const broadIdentityQueue=broadIdentityRows.map(r=>({slug:r.slug,scientific:r.scientific,identityScope:r.identityScope,action:'SPECIES_SELECTION_REQUIRED_FOR_PRECISE_SUITABILITY',smartRecommendationPolicy:'BLOCK_POSITIVE_UNTIL_SPECIES_RESOLVED',source:r.source})).sort((a,b)=>a.slug.localeCompare(b.slug));
const researchRows=rows.filter(r=>r.status==='RESEARCH_REQUIRED');
const queue=researchRows.map(r=>{const reasons=r.reasons||[];let priority='P2_EVIDENCE_ENRICHMENT';if(r.readinessShort==='D'||reasons.includes('MISSING_FROST_SENSITIVITY'))priority='P0_IDENTITY_OR_CORE_BLOCK';else if(r.needsReview||reasons.includes('NEEDS_REVIEW'))priority='P1_REVIEW_HOLD';return {slug:r.slug,priority,readiness:r.readinessShort,gate:r.gate,reasons,unknownOutcomes:r.unknownOutcomes||[],source:r.source};}).sort((a,b)=>a.priority.localeCompare(b.priority)||a.slug.localeCompare(b.slug));
const priorityCounts={P0_IDENTITY_OR_CORE_BLOCK:0,P1_REVIEW_HOLD:0,P2_EVIDENCE_ENRICHMENT:0};for(const row of queue)priorityCounts[row.priority]=(priorityCounts[row.priority]||0)+1;
const auditRows=rows.map(r=>({slug:r.slug,source:r.source,status:r.status,readiness:r.readinessShort,gate:r.gate,reasons:r.reasons||[],unknownOutcomes:r.unknownOutcomes||[],realContradiction:r.realContradiction===true,runtimeAliases:r.runtimeAliases||[],packet:r.packet||null}));
const report={contract:'cruvit-full-catalog-revalidation-v1',generatedAt:new Date().toISOString(),runtime:{total:runtimeReport.total,counts:runtimeReport.counts,gates:runtimeReport.gates,canonicalUnique:runtimeCanonicalBy.size},packets:{files:packetFiles.length,unique:packetBy.size,counts:packetReport.counts,gates:packetReport.gates,canonicalUnique:packetCanonicalBy.size,canonicalCounts:canonicalPacketReport.counts,realContradictionHolds:nativeContradictionHolds},coverage:{unifiedUnique:unifiedBy.size,overlap:overlap.length,runtimeOnlyCount:runtimeOnly.length,packetOnlyCount:packetOnly.length,runtimeOnly:runtimeOnly.sort(),packetOnly:packetOnly.sort(),aliasMappings:ALIAS_TO_CANONICAL},unified:{counts:unifiedReport.counts,gates:unifiedReport.gates,statusCounts,reasonFrequency},broadIdentityQueue:{total:broadIdentityQueue.length,rows:broadIdentityQueue},researchQueue:{total:queue.length,priorityCounts,rows:queue},rows:auditRows};
fs.writeFileSync(path.join(ROOT,'tests/_full-catalog-revalidation-v1-report.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'data/catalog/revalidation/full-catalog-broad-identity-queue-2026-10-01-v1.json'),JSON.stringify({contract:'cruvit-full-catalog-broad-identity-queue-v1',createdAt:'2026-10-01',total:broadIdentityQueue.length,rows:broadIdentityQueue},null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'data/catalog/revalidation/full-catalog-revalidation-queue-2026-10-01-v1.json'),JSON.stringify({contract:'cruvit-full-catalog-revalidation-queue-v1',createdAt:'2026-10-01',total:queue.length,priorityCounts,rows:queue},null,2)+'\n');
console.log(JSON.stringify({runtime:report.runtime,packets:report.packets,coverage:report.coverage,unified:report.unified,researchQueue:report.researchQueue,nonPass:rows.filter(r=>r.status!=='PASS_FULL').map(r=>({slug:r.slug,source:r.source,status:r.status,readiness:r.readinessShort,gate:r.gate,reasons:r.reasons,unknown:r.unknownOutcomes}))},null,2));
