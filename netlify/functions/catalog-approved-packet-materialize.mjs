import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket
} from '../../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import {
  seedPlantToCatalogRow
} from '../../modules/catalog/canonical-catalog-persistence-contract-v1.js';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}

function safePacketPath(value) {
  const p=String(value||'').trim().replace(/^\/+/, '');
  if (!p || p.includes('..') || !(p.endsWith('.packet.json') || p.endsWith('/packet.json'))) return '';
  if (
    !p.startsWith('data/catalog-expansion/batches/')
    && !p.startsWith('data/catalog-expansion/packets/')
  ) return '';
  return p;
}

export default async (req) => {
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const packetPath=safePacketPath(url.searchParams.get('path'));
  if(!packetPath) return json(400,{ok:false,code:'SAFE_PACKET_PATH_REQUIRED'});

  const packetRes=await fetch(new URL('/'+packetPath, req.url), {
    headers:{'cache-control':'no-cache'}
  });
  if(!packetRes.ok) return json(404,{ok:false,code:'PACKET_NOT_FOUND',packetPath});
  let packet=null;
  try{packet=await packetRes.json();}catch{
    return json(422,{ok:false,code:'PACKET_JSON_INVALID',packetPath});
  }

  const validation=validateCatalogExpansionPacket(packet);
  if(!validation.ok) {
    return json(422,{
      ok:false,
      code:'PACKET_VALIDATION_FAILED',
      packetPath,
      errors:validation.errors||[],
      warnings:validation.warnings||[]
    });
  }

  const materialized=materializePlantCatalogItemFromPacket(packet,{
    updatedAt:'1970-01-01T00:00:00.000Z'
  });
  if(!materialized.ok || !materialized.item) {
    return json(422,{
      ok:false,
      code:'PACKET_MATERIALIZATION_FAILED',
      packetPath,
      errors:materialized.errors||[]
    });
  }

  const row=seedPlantToCatalogRow(materialized.item,{
    catalogVersion:'1.0.0',
    sourcePacket:packet.packetId
  });

  return json(200,{
    ok:true,
    contract:'catalog-approved-packet-materialize-v1',
    packetPath,
    packetId:packet.packetId,
    canonicalSlug:packet.identity?.canonicalSlug||null,
    approvedForIngest:packet.humanApproval?.approvedForIngest===true,
    validationWarnings:validation.warnings||[],
    row
  });
};

export const config={
  path:'/.netlify/functions/catalog-approved-packet-materialize'
};
