import fs from 'node:fs';
import path from 'node:path';
import {validateCatalogExpansionPacket,materializePlantCatalogItemFromPacket} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
const root='data/catalog-expansion/batches';
const files=[];
const walk=d=>{for(const n of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,n.name);if(n.isDirectory())walk(p);else if(n.isFile()&&n.name.endsWith('.json')&&p.includes(path.sep+'packets'+path.sep))files.push(p);}};
walk(root);
const rows=[];
for(const f of files){let p;try{p=JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));}catch{continue;}const v=validateCatalogExpansionPacket(p);if(!v.ok)continue;const m=materializePlantCatalogItemFromPacket(p,{updatedAt:'AUDIT'});if(!m.ok)continue;const rc=m.item?.climateTraits?.reproductiveClimate?.fruiting; if(!rc)continue; rows.push({slug:m.item.slug,file:f,approved:p.humanApproval?.approvedForIngest===true,heat:rc.summerHeatBand||null,dry:rc.requiresDrySeason===true,humid:rc.humidClimateLimitsFruiting===true,state:rc.evidenceState||null,refs:rc.transformRefs||rc.transformRef||null,excerpt:rc.sourceExcerpt||null});}
const affected=rows.filter(x=>x.dry||x.humid);
console.log(JSON.stringify({packetCount:files.length,materializedReproductive:rows.length,affectedCount:affected.length,affected},null,2));