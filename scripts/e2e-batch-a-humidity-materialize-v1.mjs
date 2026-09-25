import fs from 'node:fs';
import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { seedPlantToCatalogRow } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';

const paths=[
  'data/catalog-expansion/batches/bulk-batch-3-v1/packets/apple.packet.json',
  'data/catalog-expansion/batches/bulk-batch-3-v1/packets/apricot.packet.json',
  'data/catalog-expansion/batches/bulk-batch-3-v1/packets/grapefruit.packet.json',
  'data/catalog-expansion/batches/bulk-batch-3-v1/packets/sweet-orange.packet.json'
];
const rows=[];
for(const path of paths){
  const packet=JSON.parse(fs.readFileSync(path,'utf8'));
  const validation=validateCatalogExpansionPacket(packet);
  if(!validation.ok) throw new Error(path+': '+JSON.stringify(validation.errors));
  const materialized=materializePlantCatalogItemFromPacket(packet,{updatedAt:'1970-01-01T00:00:00.000Z'});
  if(!materialized.ok||!materialized.item) throw new Error(path+': materialization failed');
  const row=seedPlantToCatalogRow(materialized.item,{catalogVersion:'1.0.0',sourcePacket:packet.packetId});
  if(row.climate_traits?.humidityTolerance!=='medium') throw new Error(path+': humidity not materialized');
  if(row.climate_traits?.traitEvidenceClasses?.humidityTolerance!=='HEURISTIC_ASSERTION') throw new Error(path+': humidity evidence class mismatch');
  rows.push({path,packetId:packet.packetId,row});
}
fs.mkdirSync('data/catalog/end-to-end-batch-a',{recursive:true});
fs.writeFileSync(
  'data/catalog/end-to-end-batch-a/humidity-materialization-2026-09-25-v1.json',
  JSON.stringify({contract:'cruvit-e2e-batch-a-humidity-materialization-v1',createdAt:'2026-09-25',count:rows.length,rows},null,2)+'\n'
);
console.log(JSON.stringify(rows.map(x=>({
  slug:x.row.slug,
  humidity:x.row.climate_traits.humidityTolerance,
  evidence:x.row.climate_traits.traitEvidenceClasses?.humidityTolerance,
  sourcePacket:x.row.source_packet
})),null,2));
