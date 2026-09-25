import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket
} from '../../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { seedPlantToCatalogRow } from '../../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { evaluateFullCruvitPlantApproval } from '../../modules/catalog/full-cruvit-plant-approval-v1.js';
import { buildPlantVisualVariantPlan } from '../../modules/garden-design/asset-factory-v1/plant-visual-variant-plan-v1.js';
import { buildPlantVisualVariantGapPlan } from '../../modules/garden-design/asset-factory-v1/plant-visual-variant-gap-plan-v1.js';
import { routeVariantExpansion } from '../../modules/garden-design/asset-factory-v1/plant-visual-variant-expansion-route-v1.js';
import {
  resolveCruvitPlantIntakeStage,
  summarizeCruvitPlantIntake
} from '../../modules/catalog/cruvit-plant-intake-engine-v1.js';
import { fetchCanonicalCatalogRow } from './_plant-full-onboarding-gate-v1.mjs';

function json(status,body){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}
function safeSlug(v){
  const s=String(v||'').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)?s:'';
}
function safeId(v){
  const s=String(v||'').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,159}$/.test(s)?s:'';
}
function safePacketPath(v){
  const p=String(v||'').trim().replace(/^\/+/, '');
  if(!p || p.includes('..')) return '';
  if(!(p.endsWith('.packet.json') || p.endsWith('/packet.json'))) return '';
  if(
    !p.startsWith('data/catalog-expansion/batches/')
    && !p.startsWith('data/catalog-expansion/packets/')
  ) return '';
  return p;
}
async function staticJson(req,path){
  const res=await fetch(new URL('/'+String(path).replace(/^\/+/,''),req.url),{cache:'no-store'});
  if(!res.ok) return null;
  try{return await res.json();}catch{return null;}
}
function identityRecord(registry,slug){
  const s=String(slug||'').toLowerCase();
  return (registry?.canonicalIdentities||[]).find(x=>
    String(x?.canonicalSlug||'').toLowerCase()===s
    || (x?.aliasSlugs||[]).some(a=>String(a||'').toLowerCase()===s)
  )||null;
}
function candidateRowsForSlug(doc,slug){
  return (doc?.rows||[]).filter(row=>String(row?.canonicalSlug||'').toLowerCase()===slug);
}

async function requestItems(req){
  if(req.method==='GET'){
    const u=new URL(req.url);
    return String(u.searchParams.get('slugs')||'')
      .split(',')
      .map(canonicalSlug=>({canonicalSlug:safeSlug(canonicalSlug)}))
      .filter(x=>x.canonicalSlug);
  }
  if(req.method==='POST'){
    let body={};try{body=await req.json();}catch{return null;}
    const items=Array.isArray(body.items)?body.items:[];
    return items.map(item=>({
      canonicalSlug:safeSlug(item?.canonicalSlug||item?.slug),
      packetPath:safePacketPath(item?.packetPath),
      candidateManifest:safeId(item?.candidateManifest)
    })).filter(x=>x.canonicalSlug);
  }
  return undefined;
}

export default async(req)=>{
  const items=await requestItems(req);
  if(items===undefined) return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  if(items===null) return json(400,{ok:false,code:'JSON_BODY_REQUIRED'});
  if(!items.length) return json(400,{ok:false,code:'ITEMS_REQUIRED'});
  if(items.length>100) return json(400,{ok:false,code:'TOO_MANY_ITEMS',maxItems:100});

  const [identityRegistry,designAssetRegistry,sizeAuthorityRegistry,catalogMediaCoverage]=await Promise.all([
    staticJson(req,'data/plant-identity.registry.json'),
    staticJson(req,'modules/garden-design/assets/plants/design-asset-registry-v1.json'),
    staticJson(req,'data/catalog/botanical-size-authority-v1.json'),
    staticJson(req,'data/catalog-media/active-canonical-image-coverage-v1.json')
  ]);
  if(!identityRegistry||!designAssetRegistry||!sizeAuthorityRegistry||!catalogMediaCoverage){
    return json(503,{ok:false,code:'INTAKE_STATIC_AUTHORITY_UNAVAILABLE'});
  }

  const results=[];
  for(const item of items){
    const slug=item.canonicalSlug;
    let catalogRow=null;
    try{catalogRow=await fetchCanonicalCatalogRow(slug);}catch(err){
      return json(503,{ok:false,code:'CANONICAL_CATALOG_READ_FAILED',canonicalSlug:slug,errorName:err?.message||null});
    }

    let packetState=null;
    if(!catalogRow && item.packetPath){
      const packet=await staticJson(req,item.packetPath);
      if(!packet){
        packetState={
          canonicalSlug:slug,
          validationOk:false,
          approvedForIngest:false,
          errors:['PACKET_NOT_FOUND']
        };
      }else{
        const validation=validateCatalogExpansionPacket(packet);
        let materializedRow=null;
        if(validation.ok){
          const m=materializePlantCatalogItemFromPacket(packet,{updatedAt:'1970-01-01T00:00:00.000Z'});
          if(m.ok&&m.item){
            materializedRow=seedPlantToCatalogRow(m.item,{
              catalogVersion:'1.0.0',
              sourcePacket:packet.packetId
            });
          }
        }
        packetState={
          canonicalSlug:packet.identity?.canonicalSlug||slug,
          validationOk:validation.ok===true && Boolean(materializedRow),
          approvedForIngest:packet.humanApproval?.approvedForIngest===true,
          errors:validation.errors||[],
          warnings:validation.warnings||[],
          packetId:packet.packetId||null,
          packetPath:item.packetPath,
          materializedRow
        };
      }
    }

    let fullApproval=null;
    let visualTransient=null;
    if(catalogRow){
      const id=identityRecord(identityRegistry,slug);
      const mediaSlug=String(id?.canonicalSlug||slug).toLowerCase();
      const mediaRecord=(catalogMediaCoverage.records||[]).find(x=>
        String(x?.slug||'').toLowerCase()===mediaSlug
      )||null;

      fullApproval=evaluateFullCruvitPlantApproval({
        catalogRow,
        identityRegistry,
        designAssetRegistry,
        sizeAuthorityRegistry,
        catalogMediaCoverageRecord:mediaRecord
      });

      if((fullApproval.blockingReasons||[]).includes('REQUIRED_VISUAL_VARIANTS_MISSING')){
        const plan=buildPlantVisualVariantPlan({
          catalogRow,
          fullOnboarding:fullApproval.onboarding
        });
        const gaps=buildPlantVisualVariantGapPlan({
          variantPlan:plan,
          registry:designAssetRegistry
        });
        let candidateRows=[];
        if(item.candidateManifest){
          const doc=await staticJson(
            req,
            'data/garden-design/plant-visual-qa-manifests/'+item.candidateManifest+'.json'
          );
          candidateRows=candidateRowsForSlug(doc,slug);
        }
        const route=routeVariantExpansion({
          gapPlan:gaps,
          sizeAuthorityRegistry,
          candidateRows
        });
        visualTransient={
          requiredPlanReady:plan.ready===true,
          missingRequiredCount:gaps.missingRequiredCount,
          missingGenerationCount:route.paidGenerationReady,
          existingCandidateReuseCount:route.qaRepairReady,
          qaPendingCount:route.qaRepairReady,
          ownerVisualReviewCount:0,
          promotionReadyCount:0,
          candidateManifest:item.candidateManifest||null,
          routeCounts:route.counts,
          paidGenerationReady:route.paidGenerationReady,
          qaRepairReady:route.qaRepairReady
        };
      }
    }

    const intake=resolveCruvitPlantIntakeStage({
      request:{canonicalSlug:slug},
      packet:packetState,
      catalogExists:Boolean(catalogRow),
      fullApproval,
      visualTransient
    });

    results.push({
      ...intake,
      packet:packetState ? {
        packetId:packetState.packetId||null,
        packetPath:packetState.packetPath||null,
        validationOk:packetState.validationOk===true,
        approvedForIngest:packetState.approvedForIngest===true,
        errors:packetState.errors||[],
        warnings:packetState.warnings||[]
      } : null,
      fullApprovalStatus:fullApproval?.status||null,
      fullApprovalBlockers:fullApproval?.blockingReasons||[],
      visualTransient
    });
  }

  return json(200,{
    ok:true,
    ...summarizeCruvitPlantIntake(results),
    paidCallsExecuted:0,
    catalogWritesExecuted:0,
    productionWritesExecuted:0,
    registryWritesExecuted:0
  });
};

export const config={path:'/.netlify/functions/cruvit-plant-intake-engine'};
